package com.inmotion.personalagenda;

import android.app.Activity;
import android.content.ContentValues;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Renders an archived day into a genuine PNG and writes it into Photos/Pictures. */
final class GalleryExporter {
    interface Callback { void onFinish(boolean success); }

    private static final float[] X={29.7f,61.8f,29.7f,61.8f,29.7f,61.8f,2.7f,46.2f};
    private static final float[] Y={2.8f,2.8f,28.1f,28.1f,53.8f,53.8f,77.0f,77.0f};
    private static final float[] W={30.9f,32f,30.9f,32f,30.9f,32f,41.8f,47.7f};
    private static final float[] H={24.9f,24.9f,24.9f,24.9f,22.1f,22.1f,17.3f,17.3f};

    static void export(Activity activity, String payload, Callback callback) {
        new Thread(() -> {
            boolean succeeded=false;
            try { succeeded=renderAndStore(activity,payload); }
            catch(Exception e) { android.util.Log.e("IN_MOTION", "Gallery export error",e); }
            final boolean result=succeeded;
            activity.runOnUiThread(() -> callback.onFinish(result));
        }, "inmotion-gallery-export").start();
    }

    private static boolean renderAndStore(Activity activity, String json) throws Exception {
        if(json==null || json.length()>160000) return false;
        JSONObject data=new JSONObject(json);
        String date=data.optString("date","").replaceAll("[^0-9-]","");
        if(date.isEmpty()) date="today";
        JSONArray slots=data.optJSONArray("slots");
        JSONArray checks=data.optJSONArray("done");
        if(slots==null||checks==null) return false;

        Bitmap original;
        try(InputStream input=activity.getAssets().open("board.jpg")){
            original=BitmapFactory.decodeStream(input);
        }
        if(original==null)return false;
        Bitmap target=Bitmap.createScaledBitmap(original,original.getWidth()*2,original.getHeight()*2,true)
                .copy(Bitmap.Config.ARGB_8888,true);
        original.recycle();
        Canvas canvas=new Canvas(target);
        float bw=target.getWidth(), bh=target.getHeight();
        TextPaint ink=new TextPaint(Paint.ANTI_ALIAS_FLAG);
        ink.setColor(Color.rgb(35,35,35));
        ink.setTextSize(29f);
        ink.setTypeface(Typeface.create("sans-serif",Typeface.NORMAL));
        Paint marker=new Paint(Paint.ANTI_ALIAS_FLAG);
        for(int i=0;i<8;i++){
            final String text=slots.optString(i,"");
            float boxX=bw*X[i]/100f,boxY=bh*Y[i]/100f;
            float boxW=bw*W[i]/100f,boxH=bh*H[i]/100f;
            float tx=boxX+boxW*.04f,ty=boxY+boxH*(i==7?.27f:.16f);
            int maxWidth=Math.max(10,(int)(boxW*.90f));
            if(!text.trim().isEmpty()){
                String limited=text.length()>4000?text.substring(0,4000):text;
                StaticLayout layout=StaticLayout.Builder.obtain(limited,0,limited.length(),ink,maxWidth)
                  .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                  .setIncludePad(false)
                  .setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE)
                  .build();
                canvas.save();
                canvas.clipRect(tx,ty,tx+maxWidth,boxY+boxH*.93f);
                canvas.translate(tx,ty);
                layout.draw(canvas);
                canvas.restore();
            }
            if(checks.optBoolean(i,false)){
                float cx=boxX+boxW*.94f,cy=boxY+boxH*.91f;
                marker.setColor(Color.rgb(177,116,34));
                marker.setStyle(Paint.Style.FILL);
                canvas.drawCircle(cx,cy,22f,marker);
                marker.setColor(Color.WHITE);
                marker.setStyle(Paint.Style.STROKE);
                marker.setStrokeWidth(4.5f);
                marker.setStrokeCap(Paint.Cap.ROUND);
                canvas.drawLine(cx-9,cy,cx-2,cy+7,marker);
                canvas.drawLine(cx-2,cy+7,cx+12,cy-9,marker);
                marker.setStyle(Paint.Style.FILL);
            }
        }
        if(Build.VERSION.SDK_INT<Build.VERSION_CODES.Q){
            target.recycle();
            // On Android 9 and earlier public Pictures requires legacy storage permission.
            return false;
        }
        ContentValues values=new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, "IN_MOTION_"+date+"_"+System.currentTimeMillis()+".png");
        values.put(MediaStore.Images.Media.MIME_TYPE,"image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/IN MOTION");
        values.put(MediaStore.Images.Media.IS_PENDING,1);
        Uri out=activity.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
        if(out==null){target.recycle();return false;}
        boolean saved=false;
        try(OutputStream stream=activity.getContentResolver().openOutputStream(out)){
            if(stream!=null)saved=target.compress(Bitmap.CompressFormat.PNG,100,stream);
        }finally{target.recycle();}
        if(saved){
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING,0);
            activity.getContentResolver().update(out,values,null,null);
            return true;
        }
        activity.getContentResolver().delete(out,null,null);
        return false;
    }
}
