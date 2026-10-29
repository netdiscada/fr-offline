package com.netdiscada.fr;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.util.Log;

/** Recebe o resultado da sessao do PackageInstaller aberta pelo AppUpdater. */
public class UpdateInstallReceiver extends BroadcastReceiver {

    private static final String TAG = "AppUpdater";

    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        switch (status) {
            case PackageInstaller.STATUS_PENDING_USER_ACTION:
                // Primeira atualizacao (ou Android < 12): o sistema pede confirmacao ao usuario
                Intent confirm = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                        ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                        : intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    try {
                        context.startActivity(confirm);
                    } catch (RuntimeException e) {
                        Log.w(TAG, "Nao foi possivel abrir a confirmacao de instalacao", e);
                    }
                }
                break;
            case PackageInstaller.STATUS_SUCCESS:
                Log.i(TAG, "Atualizacao instalada");
                break;
            default:
                String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                Log.w(TAG, "Instalacao falhou (" + status + "): " + msg);
                // Cancelou (ex.: tocou fora da confirmacao): oferece "Instalar" de novo ao voltar pro app
                AppUpdater.markInstallInterrupted(context);
                if (status != PackageInstaller.STATUS_FAILURE_ABORTED) {
                    AppUpdater.toast(context.getApplicationContext(), "Falha ao instalar atualizacao: " + msg);
                }
        }
    }
}
