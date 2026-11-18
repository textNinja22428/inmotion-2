package com.cookingrotations.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewAssetLoader;
import android.webkit.ValueCallback;
import android.net.Uri;

public final class MainActivity extends Activity {
  private static final int PICK_MEDIA = 1106;
  private WebView webView;
  private ValueCallback<Uri[]> fileCallback;
  private MediaPlayer openingAudio;

  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Window window = getWindow();
    window.setStatusBarColor(Color.rgb(38,25,39));
    window.setNavigationBarColor(Color.rgb(255,249,246));
    window.getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

    webView = new WebView(this);
    webView.setBackgroundColor(Color.rgb(34,22,34));
    webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
    WebSettings settings=webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setDefaultTextEncodingName("UTF-8");
    final WebViewAssetLoader assetsLoader = new WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
      .build();
    webView.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return assetsLoader.shouldInterceptRequest(request.getUrl());
      }
    });
    webView.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if(fileCallback!=null)fileCallback.onReceiveValue(null);
        fileCallback=callback;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/*","video/*","application/json"});
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
        try { startActivityForResult(intent,PICK_MEDIA); }
        catch(ActivityNotFoundException ex){fileCallback.onReceiveValue(null);fileCallback=null;return false;}
        return true;
      }
    });
    setContentView(webView);
    webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    try {
      AssetFileDescriptor afd = getAssets().openFd("jjba_notification.mp3");
      openingAudio = new MediaPlayer();
      openingAudio.setDataSource(afd.getFileDescriptor(),afd.getStartOffset(),afd.getLength());
      afd.close();
      openingAudio.setOnCompletionListener(m -> {m.release();openingAudio=null;});
      openingAudio.prepare();
      openingAudio.start();
    } catch(Exception ignored) { }
  }
  @Override protected void onActivityResult(int req,int result,Intent data){
    super.onActivityResult(req,result,data);
    if(req==PICK_MEDIA && fileCallback!=null){
      Uri[] resultUris=null;
      if(result==RESULT_OK && data!=null){
        if(data.getClipData()!=null){
          int count=data.getClipData().getItemCount();
          resultUris=new Uri[count];
          for(int i=0;i<count;i++)resultUris[i]=data.getClipData().getItemAt(i).getUri();
        }else if(data.getData()!=null){resultUris=new Uri[]{data.getData()};}
      }
      fileCallback.onReceiveValue(resultUris);
      fileCallback=null;
    }
  }
  @Override public void onBackPressed(){
    webView.evaluateJavascript("(function(){if(document.getElementById('modalWrap').classList.contains('show')){closeModal()}else if(document.querySelector('.page.active').id!=='home'){setPage('home')}else{return 'exit'}})()", value->{if("\"exit\"".equals(value))MainActivity.super.onBackPressed();});
  }
  @Override protected void onPause(){super.onPause();if(webView!=null)webView.onPause();}
  @Override protected void onResume(){super.onResume();if(webView!=null)webView.onResume();}
  @Override protected void onDestroy(){
    if(fileCallback!=null)fileCallback.onReceiveValue(null);
    if(openingAudio!=null){openingAudio.release();openingAudio=null;}
    if(webView!=null){webView.destroy();webView=null;}
    super.onDestroy();
  }
}
