package com.netdiscada.fr;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Canal dos avisos do app (ex.: "App FR atualizado"). */
    static final String NOTIFICATION_CHANNEL_ID = "fr_avisos";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(FrPdfPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    @Override
    public void onResume() {
        super.onResume();
        AppUpdater.checkOnResume(this);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID, "Avisos do app", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Atualizações do app FR");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }
}
