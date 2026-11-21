package com.cookingrotations.app;

import android.content.Context;
import android.media.MediaPlayer;
import android.net.Uri;
import android.view.LayoutInflater;
import android.widget.FrameLayout;
import android.widget.MediaController;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

/**
 * Texture-backed Media3 player. Keeps the old VideoView-compatible API at the call site,
 * while rendering video inside the same composited view hierarchy as the WebView.
 * The old VideoView/SurfaceView could deliver audio but render an invisible black picture.
 */
public final class CinemaPlayerView extends FrameLayout {
  private final PlayerView video;
  private final ExoPlayer player;
  private MediaPlayer.OnPreparedListener onPrepared;
  private MediaPlayer.OnCompletionListener onComplete;
  private MediaPlayer.OnErrorListener onError;
  private boolean readyNotified=false;
  private boolean firstFrame=false;
  private boolean started=false;

  public CinemaPlayerView(Context context){
    super(context);
    setBackgroundColor(android.graphics.Color.BLACK);
    video=(PlayerView)LayoutInflater.from(context).inflate(R.layout.cinema_player,this,false);
    addView(video,new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT,LayoutParams.MATCH_PARENT));
    DefaultRenderersFactory renderers=new DefaultRenderersFactory(context)
        .setEnableDecoderFallback(true);
    player=new ExoPlayer.Builder(context,renderers).build();
    video.setPlayer(player);
    video.setKeepScreenOn(true);
    player.addListener(new Player.Listener(){
      @Override public void onPlaybackStateChanged(int state){
        if(state==Player.STATE_READY&&!readyNotified){
          readyNotified=true;
          if(onPrepared!=null)onPrepared.onPrepared(null);
        }else if(state==Player.STATE_ENDED){
          if(onComplete!=null)onComplete.onCompletion(null);
        }
      }
      @Override public void onRenderedFirstFrame(){firstFrame=true;}
      @Override public void onPlayerError(PlaybackException error){
        if(onError!=null)onError.onError(null,error.errorCode,0);
      }
    });
  }

  public void setVideoURI(Uri uri){
    started=false;
    firstFrame=false;
    readyNotified=false;
    player.setMediaItem(MediaItem.fromUri(uri));
    player.prepare();
  }
  public void setMediaController(MediaController ignored){
    // PlayerView provides its own reliable video controls, seek bar and fullscreen surface.
  }
  public void setOnPreparedListener(MediaPlayer.OnPreparedListener callback){onPrepared=callback;}
  public void setOnCompletionListener(MediaPlayer.OnCompletionListener callback){onComplete=callback;}
  public void setOnErrorListener(MediaPlayer.OnErrorListener callback){onError=callback;}
  public void start(){started=true;player.play();}
  public void pause(){player.pause();}
  public void seekTo(int ms){player.seekTo(Math.max(0,ms));}
  public int getDuration(){
    long d=player.getDuration();
    return d==C.TIME_UNSET||d<0||d>Integer.MAX_VALUE?0:(int)d;
  }
  public int getCurrentPosition(){
    long p=player.getCurrentPosition();
    return p<0||p>Integer.MAX_VALUE?0:(int)p;
  }
  public boolean hasRenderedVideoFrame(){return firstFrame;}
  public boolean hasStarted(){return started;}
  public void stopPlayback(){
    player.pause();
    video.setPlayer(null);
    player.release();
  }
}
