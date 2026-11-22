package com.cookingrotations.app;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Internal HUNT v1.7 vault. NOT exposed through addJavascriptInterface.
 * Main-frame origin-restricted WebMessageListener is the only entry point.
 * Keep Java source package aligned with the existing Android host; the
 * final signed HUNT APK's manifest application ID is com.hunt.shredpath.
 */
public final class HuntStorageBridge {
  private static final int LIMIT = 32*1024*1024;
  private static final String SCHEMA = "1.7.0";
  private final AtomicFile slotA, slotB, legacy;

  public HuntStorageBridge(Context context) {
    File dir = new File(context.getFilesDir(), "hunt_vault");
    if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("VAULT_DIR_UNAVAILABLE");
    slotA = new AtomicFile(new File(dir, "ledger_a.json"));
    slotB = new AtomicFile(new File(dir, "ledger_b.json"));
    legacy = new AtomicFile(new File(dir, "v16_immutable.json"));
  }

  private static String success(String code, long revision) {
    return "{\"ok\":true,\"status\":"+JSONObject.quote(code)+",\"revision\":"+revision+"}";
  }
  private static String failure(String code) {
    return "{\"ok\":false,\"error\":"+JSONObject.quote(code)+"}";
  }
  private static String sha(String raw) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
    StringBuilder b = new StringBuilder();
    for (byte x:digest) b.append(String.format(Locale.ROOT, "%02x", x&0xff));
    return b.toString();
  }
  private static boolean validLedger(String raw) {
    if(raw==null||raw.getBytes(StandardCharsets.UTF_8).length>LIMIT)return false;
    try {
      JSONObject j=new JSONObject(raw);
      return SCHEMA.equals(j.optString("schemaVersion")) &&
        j.opt("huntLogs") instanceof JSONArray &&
        j.opt("practiceSessions") instanceof JSONArray &&
        j.optDouble("openingBalanceMinutes",-1)>=0;
    }catch(Exception ignored){return false;}
  }
  private static String read(AtomicFile f)throws IOException{
    try(FileInputStream in=f.openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){
      byte[] buffer=new byte[8192];int n;
      while((n=in.read(buffer))>=0){
        if(n==0)continue;
        if(out.size()+n>LIMIT+1048576)throw new IOException("VAULT_TOO_LARGE");
        out.write(buffer,0,n);
      }
      return out.toString("UTF-8");
    }catch(java.io.FileNotFoundException e){return null;}
  }
  private static void write(AtomicFile f,String contents)throws IOException{
    FileOutputStream out=null;
    try {
      out=f.startWrite();
      out.write(contents.getBytes(StandardCharsets.UTF_8));
      out.getFD().sync();
      f.finishWrite(out);out=null;
    }catch(IOException|RuntimeException e){
      if(out!=null)f.failWrite(out);
      throw e;
    }
  }
  private static final class Slot {
    final long revision;final String text;
    Slot(long rev,String txt){revision=rev;text=txt;}
  }
  private static Slot inspect(AtomicFile f){
    try {
      String raw=read(f);
      if(raw==null)return null;
      JSONObject j=new JSONObject(raw);
      long rev=j.getLong("revision");
      String contents=j.getString("ledger");
      if(rev<1||!validLedger(contents)||!sha(contents).equals(j.getString("sha256")))return null;
      return new Slot(rev,contents);
    }catch(Exception ignored){return null;}
  }
  public synchronized String loadLedgerWithRecovery(){
    Slot a=inspect(slotA),b=inspect(slotB);
    if(a==null&&b==null)return "";
    return b==null||(a!=null&&a.revision>=b.revision)?a.text:b.text;
  }
  public synchronized String getVaultStatus(){
    Slot a=inspect(slotA),b=inspect(slotB);
    long rev=Math.max(a==null?0:a.revision,b==null?0:b.revision);
    return "{\"ok\":true,\"revision\":"+rev+",\"validSlots\":"+((a==null?0:1)+(b==null?0:1))+"}";
  }
  public synchronized String sealLegacySnapshotOnce(String raw){
    try{
      if(raw==null||raw.getBytes(StandardCharsets.UTF_8).length>LIMIT)return failure("LEGACY_TOO_LARGE");
      JSONObject j=new JSONObject(raw);
      if(!(j.opt("hunts") instanceof JSONArray)||!(j.opt("skills") instanceof JSONObject))
        return failure("INVALID_V16_SCHEMA");
      String before=read(legacy);
      if(before!=null)return before.equals(raw)?success("ALREADY_SEALED",0):failure("LEGACY_BACKUP_CONFLICT");
      File original=legacy.getBaseFile();
      if(original.exists()||new File(original.getPath()+".bak").exists())return failure("LEGACY_BACKUP_CORRUPT");
      write(legacy,raw);
      return raw.equals(read(legacy))?success("SEALED",0):failure("LEGACY_VERIFY_FAILED");
    }catch(Exception ignored){return failure("LEGACY_SEAL_FAILED");}
  }
  public synchronized String saveLedgerAtomic(String raw){
    try{
      if(!validLedger(raw))return failure("INVALID_V17_SCHEMA");
      Slot a=inspect(slotA),b=inspect(slotB);
      long rev=Math.max(a==null?0:a.revision,b==null?0:b.revision);
      if(rev==Long.MAX_VALUE)return failure("REVISION_OVERFLOW");
      if(rev==0&&(slotA.getBaseFile().exists()||slotB.getBaseFile().exists()))return failure("VAULT_SLOTS_CORRUPT");
      AtomicFile dest=a==null||(b!=null&&a.revision<=b.revision)?slotA:slotB;
      JSONObject envelope=new JSONObject();
      envelope.put("revision",rev+1);
      envelope.put("sha256",sha(raw));
      envelope.put("ledger",raw);
      write(dest,envelope.toString());
      Slot check=inspect(dest);
      return check!=null&&check.revision==rev+1&&check.text.equals(raw)?
        success("COMMITTED",rev+1):failure("SAVE_VERIFY_FAILED");
    }catch(Exception ignored){return failure("SAVE_FAILED");}
  }
  public synchronized String buildExportBundle(long timeMillis){
    try{
      String now=loadLedgerWithRecovery(),old=read(legacy);
      if(now.isEmpty()&&(old==null||old.isEmpty()))return failure("NOTHING_TO_EXPORT");
      JSONObject out=new JSONObject();
      out.put("bundleType","HUNT_VAULT_EXTERNAL_BACKUP");
      out.put("schemaVersion",SCHEMA);
      out.put("exportedAtEpochMs",timeMillis);
      out.put("status",new JSONObject(getVaultStatus()));
      out.put("v17LedgerRaw",now);
      out.put("v17LedgerSha256",now.isEmpty()?"":sha(now));
      out.put("v16LegacyRaw",old==null?"":old);
      return out.toString(2);
    }catch(Exception ignored){return failure("EXPORT_FAILED");}
  }
}