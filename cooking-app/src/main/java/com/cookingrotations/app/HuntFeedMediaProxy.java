package com.cookingrotations.app;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Stream a USER-IMPORTED SAF video to the same-origin HUNT WebView.
 * Does not copy videos into app data or expose them over the network.
 * MainActivity must validate the requested URI against the persisted cinema catalog.
 */
final class HuntFeedMediaProxy {
  private HuntFeedMediaProxy(){}
  static WebResourceResponse error(int status,String reason){
    WebResourceResponse r=new WebResourceResponse("text/plain","UTF-8",
      new ByteArrayInputStream(reason.getBytes(StandardCharsets.UTF_8)));
    r.setStatusCodeAndReasonPhrase(status,reason);
    r.setResponseHeaders(new HashMap<String,String>());
    return r;
  }
  private static final class Bounded extends FilterInputStream{
    private final AssetFileDescriptor descriptor;
    private long remaining;
    Bounded(InputStream in,AssetFileDescriptor desc,long max){
      super(in);descriptor=desc;remaining=max;
    }
    @Override public int read()throws IOException{
      if(remaining<=0)return -1;
      int b=super.read();if(b>=0)remaining--;return b;
    }
    @Override public int read(byte[] b,int off,int len)throws IOException{
      if(remaining<=0)return -1;
      int read=super.read(b,off,(int)Math.min((long)len,remaining));
      if(read>0)remaining-=read;return read;
    }
    @Override public void close()throws IOException{
      try{super.close();}finally{descriptor.close();}
    }
  }
  private static final class OpenEnded extends FilterInputStream{
    private final AssetFileDescriptor descriptor;
    OpenEnded(InputStream in,AssetFileDescriptor desc){super(in);descriptor=desc;}
    @Override public void close()throws IOException{try{super.close();}finally{descriptor.close();}}
  }
  private static void skipCompletely(InputStream stream,long bytes)throws IOException{
    while(bytes>0){
      long n=stream.skip(bytes);
      if(n>0){bytes-=n;continue;}
      if(stream.read()<0)throw new IOException("Video stream truncated");
      bytes--;
    }
  }
  static WebResourceResponse stream(Context ctx,Uri uri,String header){
    AssetFileDescriptor afd=null;
    try{
      afd=ctx.getContentResolver().openAssetFileDescriptor(uri,"r");
      if(afd==null)return error(404,"Not Found");
      long size=afd.getLength();
      if(size<0&&afd.getParcelFileDescriptor()!=null)size=afd.getParcelFileDescriptor().getStatSize();
      long start=0,end=(size>0?size-1:-1);
      boolean partial=false;
      // Chrome / Android media engines make independent Range requests on seek.
      if(header!=null&&header.startsWith("bytes=")&&size>0){
        String spec=header.substring(6).trim();
        int dash=spec.indexOf('-');
        if(dash<=0||spec.indexOf(',')>=0){afd.close();return error(416,"Range Not Satisfiable");}
        start=Long.parseLong(spec.substring(0,dash).trim());
        if(start>=size||start<0){afd.close();return error(416,"Range Not Satisfiable");}
        String endText=spec.substring(dash+1).trim();
        if(!endText.isEmpty())end=Math.min(size-1,Long.parseLong(endText));
        if(end<start){afd.close();return error(416,"Range Not Satisfiable");}
        partial=true;
      }
      InputStream raw=afd.createInputStream();
      skipCompletely(raw,start);
      InputStream bounded=(size>0?new Bounded(raw,afd,end-start+1):new OpenEnded(raw,afd));
      afd=null; // Response stream takes ownership; release only when WebView closes it.
      String mime=ctx.getContentResolver().getType(uri);
      if(mime==null||!mime.startsWith("video/"))mime="video/mp4";
      WebResourceResponse response=new WebResourceResponse(mime,null,bounded);
      response.setStatusCodeAndReasonPhrase(partial?206:200,partial?"Partial Content":"OK");
      Map<String,String> headers=new HashMap<>();
      headers.put("Cache-Control","no-store");
      headers.put("Accept-Ranges",size>0?"bytes":"none");
      headers.put("Access-Control-Allow-Origin","https://appassets.androidplatform.net");
      headers.put("X-Content-Type-Options","nosniff");
      if(size>0){
        headers.put("Content-Length",Long.toString(end-start+1));
        if(partial)headers.put("Content-Range","bytes "+start+"-"+end+"/"+size);
      }
      response.setResponseHeaders(headers);
      return response;
    }catch(Exception e){
      if(afd!=null)try{afd.close();}catch(Exception ignored){}
      return error(404,"Unavailable Video");
    }
  }
}
