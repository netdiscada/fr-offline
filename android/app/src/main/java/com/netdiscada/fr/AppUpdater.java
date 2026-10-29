package com.netdiscada.fr;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.util.TypedValue;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.pm.PackageInfoCompat;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Atualizacao do APK com confirmacao do usuario.
 *
 * O workflow "Lançar APK" do fr-apk (privado) envia a cada build o APK assinado e um update.json
 * para o repositorio publico netdiscada/fr-releases (so os arquivos, sem codigo). Ao abrir o app,
 * se houver versao nova, aparece "Atualizacao disponivel" com [Atualizar agora] e [Mais tarde].
 * "Atualizar agora" baixa o APK mostrando o progresso, confere o SHA-256 e oferece [Instalar],
 * que instala por cima pelo PackageInstaller (o Android pode pedir uma confirmacao).
 */
public final class AppUpdater {

    static final String UPDATE_URL =
            "https://raw.githubusercontent.com/netdiscada/fr-releases/main/update.json";
    static final String ACTION_INSTALL_STATUS = "com.netdiscada.fr.UPDATE_INSTALL_STATUS";

    private static final String TAG = "AppUpdater";
    private static final String PREFS = "app_updater";
    private static final String PREF_LAST_CHECK = "last_check";
    private static final String PREF_AWAITING_PERMISSION = "awaiting_permission";
    private static final String PREF_INSTALL_INTERRUPTED = "install_interrupted";
    private static final long MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000L;
    private static final int TIMEOUT_MS = 30_000;

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);

    /** Versao que o usuario adiou com "Mais tarde": so pergunta de novo quando o app reabrir. */
    private static long postponedCode = 0;
    /** Atualizacao aguardando o usuario liberar "instalar apps desconhecidos". */
    private static UpdateInfo pendingAfterPermission = null;
    private static AlertDialog visibleDialog = null;
    private static WeakReference<Activity> lastActivity = null;

    public interface Callback {
        void onResult(Result result);
    }

    public static final class Result {
        public final String status; // up-to-date | update-available | busy | error
        public final String message;
        public final long currentVersionCode;
        public final String currentVersionName;
        public final long latestVersionCode;
        public final String latestVersionName;

        Result(String status, String message, long currentCode, String currentName, long latestCode, String latestName) {
            this.status = status;
            this.message = message;
            this.currentVersionCode = currentCode;
            this.currentVersionName = currentName;
            this.latestVersionCode = latestCode;
            this.latestVersionName = latestName;
        }
    }

    private static final class UpdateInfo {
        final long code;
        final String name;
        final String apkUrl;
        final String sha256;

        UpdateInfo(long code, String name, String apkUrl, String sha256) {
            this.code = code;
            this.name = name;
            this.apkUrl = apkUrl;
            this.sha256 = sha256;
        }
    }

    private AppUpdater() {}

    /** Chamado no onResume da MainActivity. */
    public static void checkOnResume(Activity activity) {
        lastActivity = new WeakReference<>(activity);
        // Voltou das configuracoes depois de liberar a instalacao: continua o download
        if (pendingAfterPermission != null && canInstall(activity)) {
            UpdateInfo info = pendingAfterPermission;
            pendingAfterPermission = null;
            prefs(activity).edit().putBoolean(PREF_AWAITING_PERMISSION, false).apply();
            startDownload(activity, info);
            return;
        }
        if (isDialogVisible()) return;
        SharedPreferences prefs = prefs(activity);
        // App foi encerrado enquanto estava nas configuracoes: pergunta de novo, sem esperar
        boolean backFromSettings = prefs.getBoolean(PREF_AWAITING_PERMISSION, false) && canInstall(activity);
        if (backFromSettings) prefs.edit().putBoolean(PREF_AWAITING_PERMISSION, false).apply();
        // Instalacao cancelada: oferece de novo na hora (o APK baixado continua no cache)
        boolean retryInstall = prefs.getBoolean(PREF_INSTALL_INTERRUPTED, false);
        if (retryInstall) {
            prefs.edit().putBoolean(PREF_INSTALL_INTERRUPTED, false).apply();
            postponedCode = 0;
        }
        long elapsed = System.currentTimeMillis() - prefs.getLong(PREF_LAST_CHECK, 0);
        if (!backFromSettings && !retryInstall && elapsed < MIN_CHECK_INTERVAL_MS) return;
        check(activity, false, null);
    }

    /** Chamado pelo UpdateInstallReceiver quando a instalacao e cancelada ou falha. */
    static void markInstallInterrupted(Context ctx) {
        prefs(ctx).edit().putBoolean(PREF_INSTALL_INTERRUPTED, true).apply();
        // O aviso do Android chega depois que o app ja voltou pra tela: reoferece na hora
        MAIN.postDelayed(() -> {
            Activity activity = lastActivity != null ? lastActivity.get() : null;
            if (activity != null && !activity.isFinishing() && activity.hasWindowFocus()) checkOnResume(activity);
        }, 500);
    }

    /**
     * Verifica se ha versao nova e, se houver, mostra o dialogo de atualizacao.
     *
     * @param interactive verificacao manual: avisa "app atualizado" e ignora o "Mais tarde"
     */
    public static void check(Activity activity, boolean interactive, Callback callback) {
        Context ctx = activity.getApplicationContext();
        long currentCode = currentVersionCode(ctx);
        String currentName = currentVersionName(ctx);

        if (!RUNNING.compareAndSet(false, true)) {
            deliver(callback, new Result("busy", "Verificacao ja em andamento", currentCode, currentName, 0, null));
            return;
        }
        prefs(ctx).edit().putLong(PREF_LAST_CHECK, System.currentTimeMillis()).apply();

        EXECUTOR.execute(() -> {
            Result result;
            try {
                JSONObject json = new JSONObject(new String(download(UPDATE_URL), "UTF-8"));
                UpdateInfo info = new UpdateInfo(
                        json.getLong("versionCode"),
                        json.optString("versionName", String.valueOf(json.getLong("versionCode"))),
                        json.getString("apkUrl"),
                        json.optString("sha256", ""));

                if (info.code <= currentCode) {
                    cleanupDownloads(ctx, null);
                    if (interactive) toast(ctx, "O app já está atualizado (versão " + currentName + ")");
                    result = new Result("up-to-date", null, currentCode, currentName, info.code, info.name);
                } else {
                    if (interactive || info.code != postponedCode) {
                        MAIN.post(() -> showUpdateDialog(activity, info, currentName));
                    }
                    result = new Result("update-available", null, currentCode, currentName, info.code, info.name);
                }
            } catch (Exception e) {
                Log.w(TAG, "Falha ao verificar atualizacao", e);
                if (interactive) toast(ctx, "Erro ao verificar atualização: " + e.getMessage());
                result = new Result("error", e.getMessage(), currentCode, currentName, 0, null);
            } finally {
                RUNNING.set(false);
            }
            deliver(callback, result);
        });
    }

    // ===== Dialogos =====

    private static void showUpdateDialog(Activity activity, UpdateInfo info, String currentName) {
        if (activity.isFinishing() || isDialogVisible()) return;
        visibleDialog = new AlertDialog.Builder(activity)
                .setTitle("Atualização disponível")
                .setMessage("A versão " + info.name + " do app FR está disponível (você tem a "
                        + currentName + ").\n\nDeseja atualizar agora?")
                .setPositiveButton("Atualizar agora", (d, w) -> updateNow(activity, info))
                .setNegativeButton("Mais tarde", (d, w) -> postponedCode = info.code)
                .setOnCancelListener(d -> postponedCode = info.code)
                .show();
    }

    private static void updateNow(Activity activity, UpdateInfo info) {
        if (canInstall(activity)) {
            startDownload(activity, info);
            return;
        }
        visibleDialog = new AlertDialog.Builder(activity)
                .setTitle("Permitir atualizações")
                .setMessage("Na próxima tela, ative \"Permitir desta fonte\" para o app FR "
                        + "e depois volte para o app. O download começa sozinho.")
                .setPositiveButton("Continuar", (d, w) -> {
                    pendingAfterPermission = info;
                    prefs(activity).edit().putBoolean(PREF_AWAITING_PERMISSION, true).apply();
                    activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.getPackageName())));
                })
                .setNegativeButton("Mais tarde", (d, w) -> postponedCode = info.code)
                .show();
    }

    private static void startDownload(Activity activity, UpdateInfo info) {
        if (activity.isFinishing()) return;
        Context ctx = activity.getApplicationContext();
        File apk = new File(updatesDir(ctx), "fr-" + info.code + ".apk");

        int pad = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 24, activity.getResources().getDisplayMetrics());
        LinearLayout layout = new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(pad, pad / 2, pad, 0);
        ProgressBar bar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setIndeterminate(true);
        TextView label = new TextView(activity);
        label.setText("Preparando download...");
        label.setPadding(0, pad / 3, 0, 0);
        layout.addView(bar);
        layout.addView(label);

        dismissVisibleDialog();
        visibleDialog = new AlertDialog.Builder(activity)
                .setTitle("Baixando versão " + info.name)
                .setView(layout)
                .setCancelable(false)
                .show();

        EXECUTOR.execute(() -> {
            try {
                cleanupDownloads(ctx, apk);
                if (!apk.exists() || info.sha256.isEmpty() || !info.sha256.equalsIgnoreCase(sha256Of(apk))) {
                    downloadToFile(info.apkUrl, apk, (done, total) -> MAIN.post(() -> {
                        if (total > 0) {
                            int pct = (int) (done * 100 / total);
                            bar.setIndeterminate(false);
                            bar.setProgress(pct);
                            label.setText(String.format("%d%% — %.1f de %.1f MB", pct, done / 1048576.0, total / 1048576.0));
                        } else {
                            label.setText(String.format("%.1f MB baixados", done / 1048576.0));
                        }
                    }));
                }
                if (!info.sha256.isEmpty() && !info.sha256.equalsIgnoreCase(sha256Of(apk))) {
                    apk.delete();
                    throw new IOException("o arquivo baixado veio corrompido");
                }
                MAIN.post(() -> showInstallDialog(activity, info, apk));
            } catch (Exception e) {
                Log.w(TAG, "Falha no download", e);
                MAIN.post(() -> showDownloadError(activity, info, e.getMessage()));
            }
        });
    }

    private static void showInstallDialog(Activity activity, UpdateInfo info, File apk) {
        dismissVisibleDialog();
        if (activity.isFinishing()) return;
        visibleDialog = new AlertDialog.Builder(activity)
                .setTitle("Download concluído")
                .setMessage("A versão " + info.name + " está pronta. Toque em Instalar para atualizar o app.")
                .setCancelable(false)
                .setPositiveButton("Instalar", (d, w) -> {
                    try {
                        install(activity.getApplicationContext(), apk);
                    } catch (IOException | RuntimeException e) {
                        Log.w(TAG, "Falha ao instalar", e);
                        toast(activity, "Falha ao instalar: " + e.getMessage());
                    }
                })
                .setNegativeButton("Mais tarde", (d, w) -> postponedCode = info.code)
                .show();
    }

    private static void showDownloadError(Activity activity, UpdateInfo info, String message) {
        dismissVisibleDialog();
        if (activity.isFinishing()) return;
        visibleDialog = new AlertDialog.Builder(activity)
                .setTitle("Não foi possível baixar")
                .setMessage("A atualização não foi baixada (" + message + "). Verifique a internet e tente de novo.")
                .setPositiveButton("Tentar de novo", (d, w) -> startDownload(activity, info))
                .setNegativeButton("Fechar", (d, w) -> postponedCode = info.code)
                .show();
    }

    private static boolean isDialogVisible() {
        return visibleDialog != null && visibleDialog.isShowing();
    }

    private static void dismissVisibleDialog() {
        if (isDialogVisible()) {
            try { visibleDialog.dismiss(); } catch (RuntimeException ignored) {}
        }
        visibleDialog = null;
    }

    private static boolean canInstall(Context ctx) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ctx.getPackageManager().canRequestPackageInstalls();
    }

    private static void install(Context ctx, File apk) throws IOException {
        PackageInstaller installer = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        params.setSize(apk.length());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }

        int sessionId = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(sessionId)) {
            try (InputStream in = new FileInputStream(apk);
                 OutputStream out = session.openWrite("base.apk", 0, apk.length())) {
                copy(in, out, null, 0);
                session.fsync(out);
            }
            Intent intent = new Intent(ctx, UpdateInstallReceiver.class).setAction(ACTION_INSTALL_STATUS);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(ctx, sessionId, intent, flags);
            session.commit(pending.getIntentSender());
        } catch (IOException | RuntimeException e) {
            installer.abandonSession(sessionId);
            throw e;
        }
        Log.i(TAG, "Instalacao iniciada: " + apk.getName());
    }

    // ===== Rede / arquivos =====

    private interface Progress {
        void onProgress(long done, long total);
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setUseCaches(false);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("Cache-Control", "no-cache");
        int code = conn.getResponseCode();
        if (code != HttpURLConnection.HTTP_OK) {
            conn.disconnect();
            throw new IOException("HTTP " + code);
        }
        return conn;
    }

    private static byte[] download(String url) throws IOException {
        HttpURLConnection conn = open(url);
        try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            copy(in, out, null, 0);
            return out.toByteArray();
        } finally {
            conn.disconnect();
        }
    }

    private static void downloadToFile(String url, File dest, Progress progress) throws IOException {
        File tmp = new File(dest.getPath() + ".part");
        HttpURLConnection conn = open(url);
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
            copy(in, out, progress, conn.getContentLengthLong());
        } finally {
            conn.disconnect();
        }
        if (dest.exists()) dest.delete();
        if (!tmp.renameTo(dest)) throw new IOException("nao foi possivel salvar o APK");
    }

    private static void copy(InputStream in, OutputStream out, Progress progress, long total) throws IOException {
        byte[] buf = new byte[64 * 1024];
        long done = 0;
        long lastReport = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
            done += n;
            if (progress != null && (done - lastReport > 128 * 1024 || done == total)) {
                lastReport = done;
                progress.onProgress(done, total);
            }
        }
        if (progress != null) progress.onProgress(done, total);
    }

    private static String sha256Of(File file) throws Exception {
        if (!file.exists()) return "";
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) digest.update(buf, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    private static File updatesDir(Context ctx) {
        File dir = new File(ctx.getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private static void cleanupDownloads(Context ctx, File keep) {
        File[] files = updatesDir(ctx).listFiles();
        if (files == null) return;
        for (File f : files) {
            if (keep == null || !f.getName().equals(keep.getName())) f.delete();
        }
    }

    // ===== Utilitarios =====

    static long currentVersionCode(Context ctx) {
        PackageInfo info = packageInfo(ctx);
        return info == null ? 0 : PackageInfoCompat.getLongVersionCode(info);
    }

    static String currentVersionName(Context ctx) {
        PackageInfo info = packageInfo(ctx);
        return info == null ? "" : info.versionName;
    }

    private static PackageInfo packageInfo(Context ctx) {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void toast(Context ctx, String msg) {
        MAIN.post(() -> Toast.makeText(ctx.getApplicationContext(), msg, Toast.LENGTH_LONG).show());
    }

    private static void deliver(Callback callback, Result result) {
        if (callback != null) MAIN.post(() -> callback.onResult(result));
    }
}
