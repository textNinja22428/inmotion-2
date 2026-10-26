package com.inmotion.personalagenda;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import org.json.JSONArray;
import org.json.JSONObject;

/* Read-only file handoff for user-owned project attachments.
   Only explicitly granted, app-private media IDs can be opened. */
public class InMotionAttachmentProvider extends ContentProvider {
    private JSONObject find(String id) {
        if(id==null||!id.matches("[a-f0-9-]{36}"))return null;
        try {
            String stored=getContext().getSharedPreferences("in_motion_settings",0)
                .getString("inmotion_media_v1","[]");
            JSONArray array=new JSONArray(stored);
            for(int i=0;i<array.length();i++){
                JSONObject item=array.optJSONObject(i);
                if(item!=null&&id.equals(item.optString("id"))&&
                    "file".equals(item.optString("kind")))return item;
            }
        }catch(Exception ignored){}
        return null;
    }
    private File getExistingFile(Uri uri) throws FileNotFoundException {
        JSONObject item=find(uri.getLastPathSegment());
        if(item==null)throw new FileNotFoundException("Attachment not found");
        File file=new File(new File(getContext().getFilesDir(),"media_v1"),
                           item.optString("id")+".bin");
        if(!file.isFile())throw new FileNotFoundException("Attachment missing");
        return file;
    }
    @Override public boolean onCreate(){return true;}
    @Override public String getType(Uri uri){
        JSONObject item=find(uri.getLastPathSegment());
        return item==null?"application/octet-stream":item.optString("mime","application/octet-stream");
    }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sortOrder){
        try{
            JSONObject item=find(uri.getLastPathSegment());
            if(item==null)return null;
            File file=getExistingFile(uri);
            String[] columns=projection==null?
              new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
            MatrixCursor cursor=new MatrixCursor(columns);
            Object[] row=new Object[columns.length];
            for(int i=0;i<columns.length;i++){
                if(OpenableColumns.DISPLAY_NAME.equals(columns[i]))row[i]=item.optString("name","Document");
                else if(OpenableColumns.SIZE.equals(columns[i]))row[i]=file.length();
                else row[i]=null;
            }
            cursor.addRow(row);return cursor;
        }catch(Exception e){return null;}
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
        if(!"r".equals(mode))throw new FileNotFoundException("Read only");
        return ParcelFileDescriptor.open(getExistingFile(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException("Read only");}
    @Override public int update(Uri uri,ContentValues values,String where,String[] args){return 0;}
    @Override public int delete(Uri uri,String where,String[] args){return 0;}
}