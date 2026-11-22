package com.cookingrotations.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Set;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.MediaMetadataRetriever;
import android.graphics.Bitmap;
import android.util.Base64;
import android.os.Build;
import java.io.ByteArrayOutputStream;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.MediaController;
import android.text.TextUtils;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
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
  private static final int PICK_CINEMA = 1108;
  private static final int PICK_HUNT_BACKUP_EXPORT = 1110;
  private static final String HUNT_APP_ORIGIN="https://appassets.androidplatform.net";
  private final ExecutorService huntVaultExecutor=Executors.newSingleThreadExecutor();
  private HuntStorageBridge huntVault;
  private String pendingVaultExportLegacy="";
  private String pendingAudioScope="legacy";
  private String pendingVideoScope="legacy";
  private MediaPlayer studioPlayer=null;
  private String studioCurrentUri="";
  private WebView webView;
  private ValueCallback<Uri[]> fileCallback;
  private MediaPlayer openingAudio;
  private MediaPlayer huntBeginCue;
  private MediaPlayer welcomeAudio;
  private long welcomeAudioStartedAt=0L;
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


  // Kitchen Cinema: content:// access is retained through the Android document picker.
  private SharedPreferences cinemaPrefs;
  private final ArrayList<CinemaVideo> cinemaVideos = new ArrayList<>();
  private FrameLayout rootView;
  private LinearLayout cinemaOverlay;
  private CinemaPlayerView cinemaVideoView;
  private TextView cinemaSizeButton;
  private String cinemaPlayingUri = "";
  private boolean cinemaMini = false;
  private long cinemaLastSaveTime = 0L;

  private static final class CinemaVideo {
    String uri, title, category;
    boolean favorite;
    int position, duration;
    long lastPlayed;
    CinemaVideo(String u,String t,String c){uri=u;title=t;category=c;}
  }

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
    cinemaPrefs=getSharedPreferences("cooking_cinema_v1",Context.MODE_PRIVATE);
    restoreCinema();
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
    setupHuntVaultMessageChannel();
    webView.addJavascriptInterface(new MusicBridge(),"NativeMusic");
    webView.addJavascriptInterface(new IntroBridge(),"NativeIntro");
    webView.addJavascriptInterface(new CinemaBridge(),"NativeCinema");
    webView.addJavascriptInterface(new StudioPlaybackBridge(),"NativeStudioPlayer");
    webView.addJavascriptInterface(new HuntAudioBridge(),"NativeHuntAudio");
    rootView=new FrameLayout(this);
    rootView.addView(webView,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
    setContentView(rootView);
    webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    handler.postDelayed(() -> { webReady = true; pushState(); sendCinemaSnapshot(); }, 1400);
    handler.postDelayed(new Runnable() {
      @Override public void run() { if(webView!=null) { if(player!=null && playing)pushState(); handler.postDelayed(this,900); } }
    }, 900);
    handler.postDelayed(new Runnable() {
      @Override public void run() {
        if (rootView!=null) {
          if (cinemaVideoView!=null && !cinemaPlayingUri.isEmpty()) {
            saveCinemaProgress();
            sendCinemaSnapshot();
          }
          handler.postDelayed(this,3500);
        }
      }
    },3500);
    try {
      AssetFileDescriptor afd=getAssets().openFd("jjba_notification.mp3");
      openingAudio=new MediaPlayer();
      openingAudio.setDataSource(afd.getFileDescriptor(),afd.getStartOffset(),afd.getLength());
      afd.close();
      openingAudio.setOnCompletionListener(m -> {m.release();openingAudio=null;});
      openingAudio.prepare(); openingAudio.start();
    } catch(Exception ignored) {}
  }


  // A short offline theme for the seven-second cinematic door-opening transition.
  // Keeping this native avoids HTML5 autoplay restrictions and does not interrupt Cooking Radio after startup.
  private final Runnable welcomeFadeTicker=new Runnable(){
    @Override public void run(){
      MediaPlayer current=welcomeAudio;
      if(current==null)return;
      long elapsed=SystemClock.uptimeMillis()-welcomeAudioStartedAt;
      if(elapsed>=7850L){stopWelcomeAudio();return;}
      // Start gently; fade away over the final second before the home interface appears.
      float fadeIn=Math.min(1f,Math.max(0f,elapsed/180f));
      float fadeOut=Math.min(1f,Math.max(0f,(7850f-elapsed)/1050f));
      float gain=.75f*fadeIn*fadeOut;
      try{current.setVolume(gain,gain);}catch(Exception ignored){}
      handler.postDelayed(this,75);
    }
  };
  private void stopWelcomeAudio(){
    handler.removeCallbacks(welcomeFadeTicker);
    MediaPlayer current=welcomeAudio;
    welcomeAudio=null;
    welcomeAudioStartedAt=0L;
    if(current!=null){try{current.stop();}catch(Exception ignored){}try{current.release();}catch(Exception ignored){}}
  }
  private boolean isWelcomeMusicEnabled(){
    return getSharedPreferences("cooking_welcome_v1",Context.MODE_PRIVATE).getBoolean("music_enabled",true);
  }
  private void startWelcomeAudio(){
    stopWelcomeAudio();
    // Splash jingle must not overlap this scene.
    if(openingAudio!=null){try{openingAudio.stop();}catch(Exception ignored){}try{openingAudio.release();}catch(Exception ignored){}openingAudio=null;}
    if(!isWelcomeMusicEnabled())return;
    AssetFileDescriptor afd=null;
    MediaPlayer mp=null;
    try{
      afd=getAssets().openFd("welcome_theme.mp3");
      mp=new MediaPlayer();
      mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
      mp.setDataSource(afd.getFileDescriptor(),afd.getStartOffset(),afd.getLength());
      afd.close();afd=null;
      final MediaPlayer thisPlayer=mp;
      mp.setOnCompletionListener(done->{
        if(welcomeAudio==thisPlayer)stopWelcomeAudio();
      });
      mp.prepare();
      welcomeAudio=mp;
      welcomeAudioStartedAt=SystemClock.uptimeMillis();
      mp.setVolume(0f,0f);
      mp.start();
      handler.post(welcomeFadeTicker);
    }catch(Exception e){
      if(afd!=null)try{afd.close();}catch(Exception ignored){}
      if(mp!=null&&mp!=welcomeAudio)try{mp.release();}catch(Exception ignored){}
      stopWelcomeAudio();
    }
  }
  private final class IntroBridge {
    @JavascriptInterface public void startWelcome(){runOnUiThread(()->startWelcomeAudio());}
    @JavascriptInterface public void stopWelcome(){runOnUiThread(()->stopWelcomeAudio());}
    @JavascriptInterface public boolean getMusicEnabled(){return isWelcomeMusicEnabled();}
    @JavascriptInterface public void setMusicEnabled(boolean v){runOnUiThread(()->{
      getSharedPreferences("cooking_welcome_v1",Context.MODE_PRIVATE).edit().putBoolean("music_enabled",v).apply();
      if(!v)stopWelcomeAudio();
    });}
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
    return title.replaceFirst("(?i)\\.(mp3|m4a|aac|wav|ogg|flac|opus|mp4|mkv|mov|webm|avi|3gp|m4v)$", "");
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
    // Scoped HUNT import confirmation comes from onHuntFilePicked.
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
    stopStudioPlayer();
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
      mp.setOnCompletionListener(done -> { if(player==done){ playing=false;if(repeat)playSong(currentSong);else pushState(); } });
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
  private void notifyHuntSelection(String kind,String scope,Intent selected){
    JSONArray items=new JSONArray();
    if(selected!=null){
      ArrayList<Uri> uris=new ArrayList<>();
      ClipData cd=selected.getClipData();
      if(cd!=null){for(int i=0;i<cd.getItemCount();i++)uris.add(cd.getItemAt(i).getUri());}
      else if(selected.getData()!=null)uris.add(selected.getData());
      for(Uri uri:uris){
        try{JSONObject obj=new JSONObject();obj.put("uri",uri.toString());obj.put("title",getDisplayName(uri));items.put(obj);}
        catch(Exception ignored){}
      }
    }
    if(webView!=null){
      String js="window.onHuntFilePicked&&window.onHuntFilePicked("+JSONObject.quote(kind)+","+JSONObject.quote(scope)+","+items.toString()+")";
      webView.evaluateJavascript(js,null);
    }
  }
  private void stopStudioPlayer(){
    studioCurrentUri="";
    MediaPlayer p=studioPlayer;studioPlayer=null;
    if(p!=null){try{p.stop();}catch(Exception ignored){}try{p.release();}catch(Exception ignored){}}
  }
  private void playStudioPreview(String rawUri){
    if(rawUri==null||!rawUri.startsWith("content://"))return;
    if(studioPlayer!=null&&rawUri.equals(studioCurrentUri)){
      try{if(studioPlayer.isPlaying())studioPlayer.pause();else studioPlayer.start();}
      catch(Exception e){stopStudioPlayer();}
      return;
    }
    stopStudioPlayer();
    pauseMusic();
    try {
      MediaPlayer mp=new MediaPlayer();studioPlayer=mp;studioCurrentUri=rawUri;
      mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
      mp.setDataSource(this,Uri.parse(rawUri));
      mp.setOnPreparedListener(p->{if(studioPlayer==p){try{p.start();}catch(Exception ignored){}}});
      mp.setOnCompletionListener(p->{if(studioPlayer==p)stopStudioPlayer();});
      mp.setOnErrorListener((p,a,b)->{if(studioPlayer==p)stopStudioPlayer();return true;});
      mp.prepareAsync();
    } catch(Exception e){stopStudioPlayer();}
  }
    private void playHuntBeginCue(){
    // Dedicated native SFX guarantees the Ritual cue even when WebView audio
    // focus changes or another HTML5 audio element is active.
    MediaPlayer previous=huntBeginCue;huntBeginCue=null;
    if(previous!=null){try{previous.stop();}catch(Exception ignored){}try{previous.release();}catch(Exception ignored){}}
    AssetFileDescriptor afd=null;MediaPlayer mp=null;
    try{
      afd=getAssets().openFd("hunt_begin.wav");
      mp=new MediaPlayer();
      mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
      mp.setDataSource(afd.getFileDescriptor(),afd.getStartOffset(),afd.getLength());
      afd.close();afd=null;
      final MediaPlayer own=mp;
      mp.setOnCompletionListener(m->{if(huntBeginCue==own)huntBeginCue=null;try{m.release();}catch(Exception ignored){}});
      mp.prepare();
      mp.setVolume(1f,1f);
      huntBeginCue=mp;
      mp.start();
    }catch(Exception e){
      if(afd!=null)try{afd.close();}catch(Exception ignored){}
      if(mp!=null)try{mp.release();}catch(Exception ignored){}
      huntBeginCue=null;
    }
  }

  private void setupHuntVaultMessageChannel(){
    if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
      Log.e("HUNT_VAULT","WEB_MESSAGE_LISTENER_UNSUPPORTED; vault unavailable, no insecure fallback.");
      return;
    }
    huntVault=new HuntStorageBridge(getApplicationContext());
    Set<String> origins=Collections.singleton(HUNT_APP_ORIGIN);
    WebViewCompat.addWebMessageListener(webView,"HuntVaultChannel",origins,
      (view,message,sourceOrigin,isMainFrame,replyProxy)->{
        if(!isMainFrame||sourceOrigin==null||!HUNT_APP_ORIGIN.equals(sourceOrigin.toString()))return;
        String raw=message.getData();
        if(raw==null||raw.length()>33*1024*1024)return;
        huntVaultExecutor.execute(()->{
          String requestId="";
          JSONObject response=new JSONObject();
          try{
            JSONObject req=new JSONObject(raw);
            requestId=req.getString("reqId");
            if(requestId.length()>120||requestId.isEmpty())throw new IllegalArgumentException("BAD_REQ_ID");
            String operation=req.getString("action");
            String payload=req.optString("payload","");
            response.put("reqId",requestId);
            String result;
            switch(operation){
              case "LOAD_LEDGER":
                response.put("result",huntVault.loadLedgerWithRecovery());
                break;
              case "SAVE_LEDGER":
                result=huntVault.saveLedgerAtomic(payload);
                addNativeResult(response,result);
                break;
              case "SEAL_LEGACY":
                result=huntVault.sealLegacySnapshotOnce(payload);
                addNativeResult(response,result);
                break;
              case "VAULT_STATUS":
                addNativeResult(response,huntVault.getVaultStatus());
                break;
              case "EXPORT_BACKUP_DIALOG":
                // No external storage write without Android's user-facing document picker.
                if(!payload.isEmpty()){
                  JSONObject checkLegacy=new JSONObject(payload);
                  if(!(checkLegacy.opt("hunts") instanceof JSONArray)||!(checkLegacy.opt("skills") instanceof JSONObject))
                    throw new IllegalArgumentException("INVALID_EXPORT_LEGACY");
                  pendingVaultExportLegacy=payload;
                } else pendingVaultExportLegacy="";
                webView.post(()->launchHuntBackupExport());
                JSONObject exportAccepted=new JSONObject();
                exportAccepted.put("ok",true);
                response.put("result",exportAccepted);
                break;
              default:
                response.put("error","UNKNOWN_ACTION");
            }
          }catch(Exception e){
            try{
              response.put("reqId",requestId);
              response.put("error","MALFORMED_BRIDGE_REQUEST");
            }catch(Exception ignored){}
          }
          String reply=response.toString();
          webView.post(()->{
            try{replyProxy.postMessage(reply);}catch(Exception ignored){}
          });
        });
      });
  }
  private static void addNativeResult(JSONObject reply,String raw)throws Exception{
    JSONObject result=new JSONObject(raw);
    if(result.optBoolean("ok",false))reply.put("result",result);
    else reply.put("error",result.optString("error","NATIVE_FAILURE"));
  }
  private void launchHuntBackupExport(){
    if(huntVault==null)return;
    String stamp=new SimpleDateFormat("yyyyMMdd_HHmm",Locale.US).format(new Date());
    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType("application/json");
    i.putExtra(Intent.EXTRA_TITLE,"HUNT_VAULT_BACKUP_"+stamp+".json");
    try{startActivityForResult(i,PICK_HUNT_BACKUP_EXPORT);}
    catch(Exception e){Log.e("HUNT_VAULT","Export file picker unavailable",e);}
  }
  private void saveExternalBackup(Uri uri){
    huntVaultExecutor.execute(()->{
      try {
        String liveSnapshot=pendingVaultExportLegacy;
        String export=huntVault.buildExportBundle(System.currentTimeMillis(),liveSnapshot);
        if(new JSONObject(export).optBoolean("ok",true)==false)throw new Exception("Nothing available for export");
        try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){
          if(out==null)throw new Exception("Cannot open export destination");
          out.write(export.getBytes(StandardCharsets.UTF_8));
          out.flush();
        }
        Log.i("HUNT_VAULT","External backup exported");
        runOnUiThread(()->android.widget.Toast.makeText(this,"HUNT backup saved",android.widget.Toast.LENGTH_SHORT).show());
      }catch(Exception e){
        Log.e("HUNT_VAULT","External backup failed",e);
        runOnUiThread(()->android.widget.Toast.makeText(this,"HUNT backup failed",android.widget.Toast.LENGTH_LONG).show());
      }
    });
  }

  private final class HuntAudioBridge{
    @JavascriptInterface public void playBegin(){runOnUiThread(()->playHuntBeginCue());}
  }
  private final class StudioPlaybackBridge {
    @JavascriptInterface public void toggle(String rawUri){runOnUiThread(()->playStudioPreview(rawUri));}
    @JavascriptInterface public void stop(){runOnUiThread(()->stopStudioPlayer());}
  }
  private final class MusicBridge {
    @JavascriptInterface public void getSnapshot(){runOnUiThread(()->{webReady=true;pushState();});}
    @JavascriptInterface public void chooseSongs(){chooseSongsFor("shred");}
    @JavascriptInterface public void chooseSongsFor(String scope){runOnUiThread(()->{
      pendingAudioScope=scope==null?"legacy":scope;
      Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
      i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("audio/*");
      i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
      i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
      try{startActivityForResult(i,PICK_AUDIO);}catch(Exception e){pendingAudioScope="legacy";webMessage("File picker unavailable");}
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


  private int dip(int dp){return Math.round(dp*getResources().getDisplayMetrics().density);}

  private void restoreCinema(){
    cinemaVideos.clear();
    try {
      JSONArray arr=new JSONArray(cinemaPrefs.getString("videos","[]"));
      for(int i=0;i<arr.length();i++){
        JSONObject o=arr.getJSONObject(i);
        String uri=o.optString("uri","");
        if(uri.isEmpty())continue;
        CinemaVideo v=new CinemaVideo(uri,o.optString("title","My video"),o.optString("category","Other"));
        v.position=o.optInt("position",0);
        v.duration=o.optInt("duration",0);
        v.lastPlayed=o.optLong("lastPlayed",0);
        v.favorite=o.optBoolean("favorite",false);
        cinemaVideos.add(v);
      }
    }catch(Exception ignored){}
  }
  private void persistCinema(){
    JSONArray arr=new JSONArray();
    for(CinemaVideo v:cinemaVideos){
      try {
        JSONObject o=new JSONObject();
        o.put("uri",v.uri);o.put("title",v.title);o.put("category",v.category);
        o.put("position",v.position);o.put("duration",v.duration);
        o.put("favorite",v.favorite);o.put("lastPlayed",v.lastPlayed);
        arr.put(o);
      }catch(Exception ignored){}
    }
    cinemaPrefs.edit().putString("videos",arr.toString()).apply();
  }
  private CinemaVideo findCinemaVideo(String uri){
    for(CinemaVideo v:cinemaVideos)if(v.uri.equals(uri))return v;
    return null;
  }
  private void sendCinemaMessage(String msg){
    if(webView!=null)webView.evaluateJavascript("window.onNativeCinemaMessage&&window.onNativeCinemaMessage("+JSONObject.quote(msg)+")",null);
  }
  private void sendCinemaSnapshot(){
    if(webView==null||!webReady)return;
    JSONArray list=new JSONArray();
    for(CinemaVideo v:cinemaVideos){
      try{
        JSONObject o=new JSONObject();
        o.put("uri",v.uri);o.put("title",v.title);o.put("category",v.category);
        o.put("favorite",v.favorite);o.put("position",v.position);
        o.put("duration",v.duration);o.put("lastPlayed",v.lastPlayed);
        list.put(o);
      }catch(Exception ignored){}
    }
    JSONObject data=new JSONObject();
    try{data.put("videos",list);data.put("playingUri",cinemaPlayingUri);}catch(Exception ignored){}
    webView.evaluateJavascript("window.onNativeCinemaSnapshot&&window.onNativeCinemaSnapshot("+data.toString()+")",null);
  }
  private void importCinemaVideos(Intent result){
    if(result==null)return;
    ArrayList<Uri> picked=new ArrayList<>();
    if(result.getClipData()!=null){
      ClipData clips=result.getClipData();
      for(int i=0;i<clips.getItemCount();i++)picked.add(clips.getItemAt(i).getUri());
    }else if(result.getData()!=null)picked.add(result.getData());
    int count=0;
    for(Uri uri:picked){
      if(findCinemaVideo(uri.toString())!=null)continue;
      try{
        getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
      }catch(Exception ignored){}
      String title=getDisplayName(uri);
      CinemaVideo video=new CinemaVideo(uri.toString(),title,"Other");
      cinemaVideos.add(0,video);count++;
    }
    persistCinema();
    sendCinemaSnapshot();
    // Scoped HUNT import confirmation comes from onHuntFilePicked.
  }
  private void saveCinemaProgress(){
    if(cinemaVideoView==null||cinemaPlayingUri.isEmpty())return;
    CinemaVideo v=findCinemaVideo(cinemaPlayingUri);
    if(v==null)return;
    try{
      int position=cinemaVideoView.getCurrentPosition();
      int duration=cinemaVideoView.getDuration();
      if(position>=0)v.position=position;
      if(duration>0)v.duration=duration;
    }catch(Exception ignored){}
    long now=System.currentTimeMillis();
    if(now-cinemaLastSaveTime>3000){
      persistCinema();
      cinemaLastSaveTime=now;
    }
  }
  private void styleCinemaButton(TextView v){
    v.setTextColor(Color.WHITE);
    v.setTextSize(13);
    v.setPadding(dip(9),dip(9),dip(9),dip(9));
  }
  private void configureCinemaOverlay(){
    if(cinemaOverlay==null||rootView==null)return;
    FrameLayout.LayoutParams lp;
    if(cinemaMini){
      int width=Math.min(getResources().getDisplayMetrics().widthPixels-dip(20),dip(440));
      lp=new FrameLayout.LayoutParams(width,dip(254),Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL);
      lp.bottomMargin=dip(88);
    }else{
      lp=new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT);
    }
    cinemaOverlay.setLayoutParams(lp);
    if(cinemaSizeButton!=null)cinemaSizeButton.setText(cinemaMini?"⛶ Expand":"↘ Mini");
    webView.evaluateJavascript("document.body.classList."+(cinemaMini?"add":"remove")+"('cinema-native-mini')",null);
  }
  private void closeCinemaVideo(){
    if(cinemaOverlay==null)return;
    saveCinemaProgress();
    persistCinema();
    if(cinemaVideoView!=null){
      try{cinemaVideoView.stopPlayback();}catch(Exception ignored){}
      cinemaVideoView=null;
    }
    rootView.removeView(cinemaOverlay);
    cinemaOverlay=null;
    cinemaSizeButton=null;
    cinemaPlayingUri="";
    cinemaMini=false;
    if(webView!=null)webView.evaluateJavascript("document.body.classList.remove('cinema-native-mini')",null);
    sendCinemaSnapshot();
  }
  private void playCinemaVideo(String uri){
    CinemaVideo file=findCinemaVideo(uri);
    if(file==null){sendCinemaMessage("Video not found in your shelf");return;}
    if(cinemaVideoView!=null && cinemaPlayingUri.equals(uri)){
      cinemaMini=false;configureCinemaOverlay();
      try{cinemaVideoView.start();}catch(Exception ignored){}
      return;
    }
    closeCinemaVideo();
    pauseMusic();
    if(webView!=null)webView.evaluateJavascript("if(typeof closeYoutubePlayer==='function')closeYoutubePlayer()",null);
    cinemaPlayingUri=file.uri;
    file.lastPlayed=System.currentTimeMillis();
    persistCinema();
    cinemaMini=false;
    cinemaOverlay=new LinearLayout(this);
    cinemaOverlay.setOrientation(LinearLayout.VERTICAL);
    cinemaOverlay.setBackgroundColor(Color.rgb(23,14,27));
    cinemaOverlay.setElevation(dip(22));
    LinearLayout bar=new LinearLayout(this);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    bar.setPadding(dip(7),dip(3),dip(6),dip(3));
    bar.setBackgroundColor(Color.rgb(55,35,63));
    TextView title=new TextView(this);
    title.setText("🍿 "+file.title);
    title.setTextColor(Color.WHITE);title.setTextSize(13);title.setSingleLine(true);
    title.setEllipsize(TextUtils.TruncateAt.END);
    bar.addView(title,new LinearLayout.LayoutParams(0,dip(43),1));
    cinemaSizeButton=new TextView(this);
    styleCinemaButton(cinemaSizeButton);
    cinemaSizeButton.setText("↘ Mini");
    cinemaSizeButton.setOnClickListener(v->{cinemaMini=!cinemaMini;configureCinemaOverlay();});
    bar.addView(cinemaSizeButton,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,ViewGroup.LayoutParams.WRAP_CONTENT));
    TextView openExternal=new TextView(this);
    openExternal.setText("↗ Open");styleCinemaButton(openExternal);
    openExternal.setOnClickListener(v->openCinemaVideoExternal(file.uri));
    bar.addView(openExternal,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,ViewGroup.LayoutParams.WRAP_CONTENT));
    TextView close=new TextView(this);
    close.setText("✕ Close");styleCinemaButton(close);
    close.setOnClickListener(v->closeCinemaVideo());
    bar.addView(close,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,ViewGroup.LayoutParams.WRAP_CONTENT));
    cinemaOverlay.addView(bar,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dip(46)));
    cinemaVideoView=new CinemaPlayerView(this);
    cinemaVideoView.setBackgroundColor(Color.BLACK);
    cinemaOverlay.addView(cinemaVideoView,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));
    rootView.addView(cinemaOverlay);
    configureCinemaOverlay();
    MediaController controls=new MediaController(this);
    controls.setAnchorView(cinemaVideoView);
    cinemaVideoView.setMediaController(controls);
    cinemaVideoView.setOnPreparedListener(mp->{
      if(cinemaVideoView==null || !cinemaPlayingUri.equals(file.uri))return;
      int length=cinemaVideoView.getDuration();
      if(length>0){file.duration=length;}
      int resume=Math.max(0,file.position);
      if(length>0 && resume>=length-1500)resume=0;
      if(resume>0)cinemaVideoView.seekTo(resume);
      cinemaVideoView.start();
      sendCinemaSnapshot();
    });
    cinemaVideoView.setOnCompletionListener(mp->{
      // Preserve the completed state; closing should not overwrite it with end-of-file time.
      cinemaPlayingUri="";
      file.position=0;persistCinema();
      closeCinemaVideo();
    });
    cinemaVideoView.setOnErrorListener((mp,what,extra)->{
      sendCinemaMessage("This video needs another decoder. Tap ↗ Open to try another video player.");
      return true;
    });
    try{
      cinemaVideoView.setVideoURI(Uri.parse(uri));cinemaVideoView.requestFocus();
      final CinemaPlayerView active=cinemaVideoView;
      handler.postDelayed(()->{
        if(cinemaVideoView==active&&active.hasStarted()&&!active.hasRenderedVideoFrame()){
          sendCinemaMessage("Audio but no picture? Tap ↗ Open to try another player.");
        }
      },6500);
    }
    catch(Exception e){closeCinemaVideo();sendCinemaMessage("Video unavailable. Please add it again from your phone.");}
    sendCinemaSnapshot();
  }
  private void openCinemaVideoExternal(String contentUri){
    try{
      Intent external=new Intent(Intent.ACTION_VIEW);
      external.setDataAndType(Uri.parse(contentUri),"video/*");
      external.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      startActivity(Intent.createChooser(external,"Choose video player"));
    }catch(Exception e){sendCinemaMessage("No external player available");}
  }
  private void openCinemaExternal(String url,String preferredPackage){
    if(url==null)return;
    Uri uri;
    try{
      uri=Uri.parse(url);
      if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null)throw new Exception();
    }catch(Exception e){sendCinemaMessage("Only HTTPS links can be opened");return;}
    closeCinemaVideo();
    try{
      Intent intent=new Intent(Intent.ACTION_VIEW,uri);
      intent.addCategory(Intent.CATEGORY_BROWSABLE);
      if(preferredPackage!=null&&!preferredPackage.isEmpty())intent.setPackage(preferredPackage);
      startActivity(intent);
    }catch(Exception e){
      try{startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE));}
      catch(Exception error){sendCinemaMessage("No app available for this link");}
    }
  }
  private void openCinemaPlatform(String service){
    if(service==null)return;
    switch(service){
      case "netflix":openCinemaExternal("https://www.netflix.com/browse","com.netflix.mediaclient");break;
      case "crunchyroll":openCinemaExternal("https://www.crunchyroll.com/","com.crunchyroll.crunchyroid");break;
      case "youtube":openCinemaExternal("https://www.youtube.com/","com.google.android.youtube");break;
      default:sendCinemaMessage("Unknown streaming platform");
    }
  }
  private final class CinemaBridge {
    @JavascriptInterface public void getSnapshot(){runOnUiThread(()->sendCinemaSnapshot());}
    // Return an actual frame from the user's local video. Never upload it.
    @JavascriptInterface public void requestVideoThumbnail(String rawUri){
      if(rawUri==null || !rawUri.startsWith("content://") || rawUri.length()>2048)return;
      new Thread(()->{
        String dataUrl="";
        MediaMetadataRetriever retriever=new MediaMetadataRetriever();
        try{
          retriever.setDataSource(MainActivity.this,Uri.parse(rawUri));
          Bitmap frame=null;
          if(Build.VERSION.SDK_INT>=27){
            try{frame=retriever.getScaledFrameAtTime(450000L,MediaMetadataRetriever.OPTION_CLOSEST_SYNC,480,270);}
            catch(Exception ignored){}
          }
          if(frame==null)frame=retriever.getFrameAtTime(450000L,MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
          if(frame==null)frame=retriever.getFrameAtTime();
          if(frame!=null){
            int w=frame.getWidth(),h=frame.getHeight();
            if(w>0 && h>0){
              int dw=Math.min(480,w),dh=Math.max(1,Math.round((float)h*dw/w));
              if(dh>300){dw=Math.max(1,Math.round((float)dw*300/dh));dh=300;}
              Bitmap thumb=Bitmap.createScaledBitmap(frame,dw,dh,true);
              ByteArrayOutputStream output=new ByteArrayOutputStream();
              thumb.compress(Bitmap.CompressFormat.JPEG,78,output);
              dataUrl="data:image/jpeg;base64,"+Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP);
              if(thumb!=frame)thumb.recycle();
            }
            frame.recycle();
          }
        }catch(Exception ignored){
          // A revoked content provider permission means this file must be reimported.
        }finally{
          try{retriever.release();}catch(Exception ignored){}
        }
        final String payload=dataUrl;
        runOnUiThread(()->{
          if(webView!=null)webView.evaluateJavascript(
            "window.onNativeVideoThumbnail&&window.onNativeVideoThumbnail("+JSONObject.quote(rawUri)+","+JSONObject.quote(payload)+")",null);
        });
      },"HUNT-thumbnail").start();
    }

    @JavascriptInterface public void chooseVideos(){chooseVideosFor("shred");}
    @JavascriptInterface public void chooseVideosFor(String scope){runOnUiThread(()->{
      pendingVideoScope=scope==null?"legacy":scope;
      Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);
      picker.addCategory(Intent.CATEGORY_OPENABLE);
      picker.setType("video/*");
      picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
      picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
      try{startActivityForResult(picker,PICK_CINEMA);}
      catch(Exception e){pendingVideoScope="legacy";sendCinemaMessage("Video picker is unavailable");}
    });}
    @JavascriptInterface public void playVideo(String uri){runOnUiThread(()->playCinemaVideo(uri));}
    @JavascriptInterface public void closeVideo(){runOnUiThread(()->closeCinemaVideo());}
    @JavascriptInterface public void updateVideo(String uri,String title,String category,boolean favorite){
      runOnUiThread(()->{
        CinemaVideo v=findCinemaVideo(uri);if(v==null)return;
        v.title=title==null||title.trim().isEmpty()?v.title:title.trim();
        v.category=category==null||category.trim().isEmpty()?"Other":category.trim();
        v.favorite=favorite;persistCinema();sendCinemaSnapshot();
      });
    }
    @JavascriptInterface public void removeVideo(String uri){runOnUiThread(()->{
      if(uri.equals(cinemaPlayingUri))closeCinemaVideo();
      cinemaVideos.removeIf(v->v.uri.equals(uri));persistCinema();sendCinemaSnapshot();
    });}
    @JavascriptInterface public void openPlatform(String service){runOnUiThread(()->openCinemaPlatform(service));}
    @JavascriptInterface public void openLink(String url){runOnUiThread(()->{
      String pkg="";
      try{
        String host=Uri.parse(url).getHost();
        if(host!=null){
          host=host.toLowerCase();
          if(host.equals("netflix.com")||host.endsWith(".netflix.com"))pkg="com.netflix.mediaclient";
          else if(host.equals("crunchyroll.com")||host.endsWith(".crunchyroll.com"))pkg="com.crunchyroll.crunchyroid";
          else if(host.equals("youtube.com")||host.endsWith(".youtube.com")||host.equals("youtu.be"))pkg="com.google.android.youtube";
        }
      }catch(Exception ignored){}
      openCinemaExternal(url,pkg);
    });}
  }

  @Override protected void onActivityResult(int req,int result,Intent data){
    super.onActivityResult(req,result,data);
    if(req==PICK_HUNT_BACKUP_EXPORT){if(result==RESULT_OK&&data!=null&&data.getData()!=null)saveExternalBackup(data.getData());return;}
    if(req==PICK_AUDIO){
      String scope=pendingAudioScope;pendingAudioScope="legacy";
      if(result==RESULT_OK)importTracks(data);
      notifyHuntSelection("audio",scope,result==RESULT_OK?data:null);
      return;
    }
    if(req==PICK_CINEMA){
      String scope=pendingVideoScope;pendingVideoScope="legacy";
      if(result==RESULT_OK)importCinemaVideos(data);
      notifyHuntSelection("video",scope,result==RESULT_OK?data:null);
      return;
    }
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
    if(cinemaOverlay!=null){closeCinemaVideo();return;}
    webView.evaluateJavascript("(function(){if(document.getElementById('modalWrap').classList.contains('show')){closeModal()}else if(document.querySelector('.page.active').id!=='home'){setPage('home')}else{return 'exit'}})()",value->{
      if("\"exit\"".equals(value))MainActivity.super.onBackPressed();
    });
  }
  @Override protected void onPause(){
    stopWelcomeAudio();
    if(cinemaVideoView!=null){saveCinemaProgress();persistCinema();cinemaVideoView.pause();}
    super.onPause();if(webView!=null)webView.onPause();
  }
  @Override protected void onResume(){super.onResume();if(webView!=null)webView.onResume();}
  @Override protected void onDestroy(){
    if(fileCallback!=null)fileCallback.onReceiveValue(null);
    if(openingAudio!=null){openingAudio.release();openingAudio=null;}
    stopWelcomeAudio();
    stopPlayer();
    stopStudioPlayer();
    huntVaultExecutor.shutdown();
    if(huntBeginCue!=null){try{huntBeginCue.release();}catch(Exception ignored){}huntBeginCue=null;}
    closeCinemaVideo();
    rootView=null;
    if(webView!=null){webView.destroy();webView=null;}
    super.onDestroy();
  }
}
