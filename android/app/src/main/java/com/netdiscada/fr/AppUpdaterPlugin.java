package com.netdiscada.fr;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Expoe o AppUpdater para o JavaScript como Capacitor.Plugins.AppUpdater. */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("versionCode", AppUpdater.currentVersionCode(getContext()));
        ret.put("versionName", AppUpdater.currentVersionName(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void check(PluginCall call) {
        AppUpdater.check(getActivity(), call.getBoolean("interactive", true), result -> {
            JSObject ret = new JSObject();
            ret.put("status", result.status);
            ret.put("message", result.message);
            ret.put("currentVersionCode", result.currentVersionCode);
            ret.put("currentVersionName", result.currentVersionName);
            ret.put("latestVersionCode", result.latestVersionCode);
            ret.put("latestVersionName", result.latestVersionName);
            call.resolve(ret);
        });
    }
}
