package com.cookingrotations.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public final class MainActivity extends Activity {
  private static final int PICK_MEDIA = 1106;
  private static final int PICK_AUDIO = 1107;
  private WebView webView;
  private ValueCallback<Uri[]> fileCallback;
  private MediaPlayer openingAudio;
  private MediaPlayer player;
  private final ArrayList<Song> tracks = new ArrayList<>();
  private String currentSong = "";
  private boolean playing = false;
  private boolean playerReady = false;
  private boolean shuffle = false;
  private boolean repeat = false;
  private int pendingPositionMs = 0;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Random random = new Random();
  private boolean webReady = false;
  private AudioManager audioManager;
  private SharedPreferences prefs;
  private final AudioManager.OnAudioFocusChangeListener focusListener = focus -> {
    if (focus <= 0) runOnUiThread(() -> pauseMusic());
  };

  private static final class Song {
    final String uri;
    final String title;
    Song(String uri, String title) { this.uri=uri; this.title=title; }
  }

  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setStatusBarColor(Color.rgb(38,25,39));
    getWindow().setNavigationBarColor(Color.rgb(255,249,246));
    getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    prefs = getSharedPreferences("cooking_music_v1", Context.MODE_PRIVATE);
    audioManager=(AudioManager)getSystemService(Context.AUDIO_SERVICE);
    restoreMusic();
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
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView,true);
    final WebViewAssetLoader assetsLoader = new WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
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
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivityForResult(intent,PICK_MEDIA); }
        catch(ActivityNotFoundException ex){ fileCallback.onReceiveValue(null);fileCallback=null;return false; }
        return true;
      }
    });
    webView.addJavascriptInterface(new MusicBridge(),"NativeMusic");
    setContentView(webView);
    webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    handler.postDelayed(() -> { webReady = true; pushState(); }, 1400);
    handler.postDelayed(new Runnable() {
      @Override public void run() { if(webView!=null) { if(player!=null && playing)pushState(); handler.postDelayed(this,900); } }
    }, 900);
    try {
      AssetFileDescriptor afd=getAssets().openFd("jjba_notification.mp3");
      openingAudio=new MediaPlayer();
      openingAudio.setDataSource(afd.getFileDescriptor(),afd.getStartOffset(),afd.getLength());
      afd.close();
      openingAudio.setOnCompletionListener(m -> {m.release();openingAudio=null;});
      openingAudio.prepare(); openingAudio.start();
    } catch(Exception ignored) {}
  }

  private void restoreMusic() {
    try {
      JSONArray arr=new JSONArray(prefs.getString("songs","[]"));
      for(int i=0;i<arr.length();i++) {
        JSONObject item=arr.getJSONObject(i);
        tracks.add(new Song(item.getString("uri"),item.optString("title","Track")));
      }
    } catch(Exception ignored) {}
    currentSong=prefs.getString("currentSong","");
    shuffle=prefs.getBoolean("shuffle",false);
    repeat=prefs.getBoolean("repeat",false);
  }
  private void persistMusic() {
    JSONArray arr=new JSONArray();
    for(Song track:tracks){
      JSONObject item=new JSONObject();
      try {item.put("uri",track.uri);item.put("title",track.title);arr.put(item);}catch(Exception ignored){}
    }
    prefs.edit().putString("songs",arr.toString()).putString("currentSong",currentSong)
      .putBoolean("shuffle",shuffle).putBoolean("repeat",repeat).apply();
  }
  private Song getSong(String id) {
    for(Song s:tracks)if(s.uri.equals(id))return s;
    return null;
  }
  private String getDisplayName(Uri uri) {
    String title=uri.getLastPathSegment();
    try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) {
      if(c!=null && c.moveToFirst())title=c.getString(0);
    }catch(Exception ignored){}
    if(title==null||title.trim().isEmpty())title="Untitled track";
    return title.replaceFirst("(?i)\\.(mp3|m4a|aac|wav|ogg|flac|opus)$", "");
  }
  private void importTracks(Intent data) {
    if(data==null)return;
    ArrayList<Uri> incoming=new ArrayList<>();
    ClipData clip=data.getClipData();
    if(clip!=null){ for(int i=0;i<clip.getItemCount();i++)incoming.add(clip.getItemAt(i).getUri()); }
    else if(data.getData()!=null)incoming.add(data.getData());
    int added=0;
    for(Uri uri:incoming){
      if(getSong(uri.toString())!=null)continue;
      try {
        getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
      }catch(Exception ignored){}
      tracks.add(new Song(uri.toString(),getDisplayName(uri)));
      added++;
    }
    persistMusic();
    pushState();
    if(added>0)webMessage(added+" song"+(added>1?"s":"")+" added to your library ♪");
  }
  private JSONObject state() {
    JSONObject o=new JSONObject(); JSONArray songs=new JSONArray();
    try {
      for(Song song:tracks){JSONObject s=new JSONObject();s.put("id",song.uri);s.put("title",song.title);songs.put(s);}
      o.put("tracks",songs);o.put("currentId",currentSong);o.put("playing",playing);
      o.put("shuffle",shuffle);o.put("repeat",repeat);
      o.put("position",playerReady&&player!=null?Math.max(0,player.getCurrentPosition()):pendingPositionMs);
      o.put("duration",playerReady&&player!=null?Math.max(0,player.getDuration()):0);
    }catch(Exception ignored){}
    return o;
  }
  private void pushState(){
    if(webView==null||!webReady)return;
    String code="window.onNativeMusicSnapshot && window.onNativeMusicSnapshot("+state().toString()+")";
    webView.evaluateJavascript(code,null);
  }
  private void webMessage(String message) {
    if(webView==null)return;
    webView.evaluateJavascript("window.onNativeMusicMessage && window.onNativeMusicMessage("+JSONObject.quote(message)+")",null);
  }
  private void stopPlayer(){
    playing=false;playerReady=false;
    if(player!=null){ try{player.reset();player.release();}catch(Exception ignored){} player=null; }
    audioManager.abandonAudioFocus(focusListener);
  }
  private void playSong(String uri){
    Song s=getSong(uri);
    if(s==null){ webMessage("Song not found — please add it again.");return; }
    stopPlayer();
    if(openingAudio!=null){try{openingAudio.stop();openingAudio.release();}catch(Exception ignored){}openingAudio=null;}
    currentSong=s.uri;pendingPositionMs=0; persistMusic();
    try {
      audioManager.requestAudioFocus(focusListener,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN);
      MediaPlayer mp=new MediaPlayer();
      player=mp;
      mp.setAudioAttributes(new AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .setUsage(AudioAttributes.USAGE_MEDIA).build());
      mp.setDataSource(this,Uri.parse(s.uri));
      mp.setOnPreparedListener(ready -> { if(player!=ready)return;playerReady=true;ready.start(); playing=true;pushState(); });
      mp.setOnCompletionListener(done -> { if(player==done){ playing=false;if(repeat)playSong(currentSong);else nextSong(false); } });
      mp.setOnErrorListener((failed,what,extra) -> {if(player==failed){stopPlayer();pushState();webMessage("Can't play this file. Re-add it from your device.");}return true;});
      mp.prepareAsync();
    }catch(Exception e){stopPlayer();webMessage("Couldn't open this song. Re-add the file.");}
    pushState();
  }
  private void pauseMusic(){
    if(playerReady&&player!=null&&playing){try{player.pause();}catch(Exception ignored){} playing=false;}
    pushState();
  }
  private void resumeMusic(){
    if(playerReady&&player!=null&&!playing){try{player.start();playing=true;}catch(Exception ignored){}}
    else if(player==null&&!currentSong.isEmpty())playSong(currentSong);
    pushState();
  }
  private void nextSong(boolean manual){
    if(tracks.isEmpty()){stopPlayer();currentSong="";pushState();return;}
    int currentIdx=0;
    for(int i=0;i<tracks.size();i++)if(tracks.get(i).uri.equals(currentSong)){currentIdx=i;break;}
    int nextIdx=shuffle&&tracks.size()>1?(currentIdx+1+random.nextInt(tracks.size()-1))%tracks.size():currentIdx+1;
    if(nextIdx>=tracks.size()){
      if(!manual){stopPlayer();currentSong="";persistMusic();pushState();return;}
      nextIdx=0;
    }
    playSong(tracks.get(nextIdx).uri);
  }
  private void previousSong(){
    if(tracks.isEmpty())return;
    int idx=0;
    for(int i=0;i<tracks.size();i++)if(tracks.get(i).uri.equals(currentSong)){idx=i;break;}
    playSong(tracks.get((idx-1+tracks.size())%tracks.size()).uri);
  }
  private final class MusicBridge {
    @JavascriptInterface public void getSnapshot(){runOnUiThread(()->{webReady=true;pushState();});}
    @JavascriptInterface public void chooseSongs(){runOnUiThread(()->{
      Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
      i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("audio/*");
      i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
      i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
      try{startActivityForResult(i,PICK_AUDIO);}catch(Exception e){webMessage("File picker unavailable");}
    });}
    @JavascriptInterface public void playTrack(String id){runOnUiThread(()->playSong(id));}
    @JavascriptInterface public void pause(){runOnUiThread(()->pauseMusic());}
    @JavascriptInterface public void resume(){runOnUiThread(()->resumeMusic());}
    @JavascriptInterface public void stop(){runOnUiThread(()->{stopPlayer();pushState();});}
    @JavascriptInterface public void next(){runOnUiThread(()->nextSong(true));}
    @JavascriptInterface public void previous(){runOnUiThread(()->previousSong());}
    @JavascriptInterface public void seek(int ms){runOnUiThread(()->{if(playerReady&&player!=null)try{player.seekTo(Math.max(0,ms));}catch(Exception ignored){}pushState();});}
    @JavascriptInterface public void setShuffle(boolean v){runOnUiThread(()->{shuffle=v;persistMusic();pushState();});}
    @JavascriptInterface public void setRepeat(boolean v){runOnUiThread(()->{repeat=v;persistMusic();pushState();});}
    @JavascriptInterface public void removeTrack(String id){runOnUiThread(()->{
      if(currentSong.equals(id)){stopPlayer();currentSong="";}
      tracks.removeIf(s->s.uri.equals(id));persistMusic();pushState();
    });}
  }

  @Override protected void onActivityResult(int req,int result,Intent data){
    super.onActivityResult(req,result,data);
    if(req==PICK_AUDIO){if(result==RESULT_OK)importTracks(data);return;}
    if(req==PICK_MEDIA && fileCallback!=null){
      Uri[] uris=null;
      if(result==RESULT_OK && data!=null){
        if(data.getClipData()!=null){int count=data.getClipData().getItemCount();uris=new Uri[count];
          for(int i=0;i<count;i++)uris[i]=data.getClipData().getItemAt(i).getUri();}
        else if(data.getData()!=null)uris=new Uri[]{data.getData()};
      }
      fileCallback.onReceiveValue(uris);fileCallback=null;
    }
  }
  @Override public void onBackPressed(){
    webView.evaluateJavascript("(function(){if(document.getElementById('modalWrap').classList.contains('show')){closeModal()}else if(document.querySelector('.page.active').id!=='home'){setPage('home')}else{return 'exit'}})()",value->{
      if("\"exit\"".equals(value))MainActivity.super.onBackPressed();
    });
  }
  @Override protected void onPause(){super.onPause();if(webView!=null)webView.onPause();}
  @Override protected void onResume(){super.onResume();if(webView!=null)webView.onResume();}
  @Override protected void onDestroy(){
    if(fileCallback!=null)fileCallback.onReceiveValue(null);
    if(openingAudio!=null){openingAudio.release();openingAudio=null;}
    stopPlayer();
    if(webView!=null){webView.destroy();webView=null;}
    super.onDestroy();
  }
}
