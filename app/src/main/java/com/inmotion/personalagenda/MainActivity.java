package com.inmotion.personalagenda;

import android.app.Activity;
import android.os.Bundle;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.SoundPool;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;
    private MediaPlayer music;
    private SoundPool soundPool;
    private int selectSoundId = 0;
    private volatile boolean selectLoaded = false;
    private SharedPreferences preferences;
    private boolean isResumed = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                             WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        preferences = getSharedPreferences("in_motion_settings", MODE_PRIVATE);
        webView = new WebView(this);
        webView.setBackgroundColor(0xffffffff);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AudioBridge(), "NativeAudio");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
        try {
            // New instrumental track; old track remains a fallback until assets are uploaded.
            AssetFileDescriptor afd;
            try { afd = getAssets().openFd("beneath_the_mask_instrumental.mp3"); }
            catch (Exception missing) { afd = getAssets().openFd("beneath_the_mask.mp3"); }
            music = new MediaPlayer();
            music.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            music.setLooping(true);
            music.prepare();
        } catch (Exception e) { Log.e("IN_MOTION", "Background music unavailable", e); }

        soundPool = new SoundPool.Builder().setMaxStreams(6)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()).build();
        soundPool.setOnLoadCompleteListener((pool, sampleId, status) -> {
            if (sampleId > 0 && status == 0) selectLoaded = true;
            if (status != 0) Log.w("IN_MOTION", "Selection sound load error: " + status);
        });
        try {
            AssetFileDescriptor effect;
            try { effect = getAssets().openFd("select_sound_loud.wav"); }
            catch (Exception missing) { effect = getAssets().openFd("select_sound.mp3"); }
            selectSoundId = soundPool.load(effect, 1);
            effect.close();
        } catch (Exception e) { Log.w("IN_MOTION", "Selection audio could not be loaded", e); }
    }

    private void syncPlayback() {
        if (music == null) return;
        boolean shouldPlay = isResumed && !preferences.getBoolean("muted", false);
        try {
            if (shouldPlay && !music.isPlaying()) music.start();
            else if (!shouldPlay && music.isPlaying()) music.pause();
        } catch (Exception e) { Log.w("IN_MOTION", "Audio playback change", e); }
    }

    public class AudioBridge {
        @JavascriptInterface public boolean isMuted() { return preferences.getBoolean("muted", false); }
        @JavascriptInterface public void setMuted(boolean muted) {
            preferences.edit().putBoolean("muted", muted).apply();
            runOnUiThread(() -> syncPlayback());
        }
        @JavascriptInterface public boolean playSelect() {
            if (soundPool == null || !selectLoaded || selectSoundId == 0) return false;
            try {
                return soundPool.play(selectSoundId, 1f, 1f, 1, 0, 1.0f) > 0;
            } catch (Exception e) {
                Log.w("IN_MOTION", "Select effect could not play", e);
                return false;
            }
        }
    }

    @Override protected void onResume() {
        super.onResume(); isResumed = true; syncPlayback(); if(webView != null) webView.onResume();
    }
    @Override protected void onPause() {
        isResumed = false; syncPlayback(); if(webView != null) webView.onPause(); super.onPause();
    }
    @Override @SuppressWarnings("deprecation") public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("window.handleAndroidBack()", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }
    @Override protected void onDestroy() {
        if (music != null) { music.release(); music = null; }
        if (soundPool != null) { soundPool.release(); soundPool = null; }
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
