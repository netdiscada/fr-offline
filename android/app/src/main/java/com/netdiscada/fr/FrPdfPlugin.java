package com.netdiscada.fr;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Recebe o PDF da FR gerado no JavaScript (base64), grava no cache do app e
 * abre no leitor de PDF do celular, no "Compartilhar" ou direto na impressão do Android.
 * Uso: Capacitor.Plugins.FrPdf.abrir({ base64, nome }) / .compartilhar(...) / .imprimir(...)
 */
@CapacitorPlugin(name = "FrPdf")
public class FrPdfPlugin extends Plugin {

    @PluginMethod
    public void abrir(PluginCall call) {
        Uri uri = gravar(call);
        if (uri == null) return;
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, "application/pdf");
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(view, "Abrir a FR com");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Nenhum leitor de PDF instalado. Use Compartilhar.");
        }
    }

    @PluginMethod
    public void compartilhar(PluginCall call) {
        Uri uri = gravar(call);
        if (uri == null) return;
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("application/pdf");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_SUBJECT, call.getString("nome", "FR.pdf"));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, "Enviar a FR");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(chooser);
        call.resolve();
    }

    /**
     * Abre a tela de impressão do Android com a FR já em A4, retrato e frente e verso (borda longa).
     * O Android sempre pede para o funcionário confirmar; a impressora escolhida fica lembrada.
     */
    @PluginMethod
    public void imprimir(PluginCall call) {
        File arquivo = gravarArquivo(call);
        if (arquivo == null) return;
        String nome = arquivo.getName().replaceAll("\\.pdf$", "");
        getActivity().runOnUiThread(() -> {
            PrintManager impressao = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            if (impressao == null) {
                call.reject("Este celular não tem impressão. Use Compartilhar.");
                return;
            }
            PrintAttributes.Builder padrao = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                padrao.setDuplexMode(PrintAttributes.DUPLEX_MODE_LONG_EDGE);
            }
            impressao.print(nome, new AdaptadorPdf(arquivo, nome), padrao.build());
            call.resolve();
        });
    }

    /** Entrega o PDF pronto para o serviço de impressão (a FR tem 2 páginas). */
    private static class AdaptadorPdf extends PrintDocumentAdapter {
        private final File arquivo;
        private final String nome;

        AdaptadorPdf(File arquivo, String nome) {
            this.arquivo = arquivo;
            this.nome = nome;
        }

        @Override
        public void onLayout(PrintAttributes antes, PrintAttributes novos, CancellationSignal cancelar,
                             LayoutResultCallback retorno, Bundle extras) {
            if (cancelar.isCanceled()) {
                retorno.onLayoutCancelled();
                return;
            }
            PrintDocumentInfo info = new PrintDocumentInfo.Builder(nome + ".pdf")
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                    .build();
            retorno.onLayoutFinished(info, !novos.equals(antes));
        }

        @Override
        public void onWrite(PageRange[] paginas, ParcelFileDescriptor destino, CancellationSignal cancelar,
                            WriteResultCallback retorno) {
            try (InputStream in = new FileInputStream(arquivo);
                 OutputStream out = new FileOutputStream(destino.getFileDescriptor())) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelar.isCanceled()) {
                        retorno.onWriteCancelled();
                        return;
                    }
                    out.write(buf, 0, n);
                }
                retorno.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
            } catch (IOException e) {
                retorno.onWriteFailed(e.getMessage());
            }
        }
    }

    /** Grava em cache/fr/<nome>.pdf e devolve a Uri do FileProvider (ou rejeita a chamada). */
    private Uri gravar(PluginCall call) {
        File arquivo = gravarArquivo(call);
        if (arquivo == null) return null;
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", arquivo);
    }

    /** Grava em cache/fr/<nome>.pdf (ou rejeita a chamada e devolve null). */
    private File gravarArquivo(PluginCall call) {
        String base64 = call.getString("base64", "");
        String nome = call.getString("nome", "FR.pdf").replaceAll("[^A-Za-z0-9_.-]+", "_");
        if (base64.isEmpty()) {
            call.reject("PDF vazio");
            return null;
        }
        File dir = new File(getContext().getCacheDir(), "fr");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Não foi possível criar a pasta do PDF");
            return null;
        }
        // Só a FR mais recente fica guardada
        File[] antigos = dir.listFiles();
        if (antigos != null) for (File f : antigos) f.delete();
        File arquivo = new File(dir, nome.endsWith(".pdf") ? nome : nome + ".pdf");
        try (FileOutputStream out = new FileOutputStream(arquivo)) {
            out.write(Base64.decode(base64, Base64.DEFAULT));
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Não foi possível gravar o PDF: " + e.getMessage());
            return null;
        }
        return arquivo;
    }
}
