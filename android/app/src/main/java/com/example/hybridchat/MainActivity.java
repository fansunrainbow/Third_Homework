package com.example.hybridchat;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.telephony.TelephonyManager;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "HybridChat";
    private static final int PERMISSION_REQUEST_CODE = 100;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // 初始化WebView
        initWebView();

        // 请求必要的权限
        requestPermissions();
    }

    private void initWebView() {
        webView = findViewById(R.id.webview);

        // 配置WebView设置
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // 设置WebViewClient，防止打开新的浏览器窗口
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Log.d(TAG, "页面加载完成: " + url);
            }
        });

        // 设置WebChromeClient，处理JavaScript对话框、权限请求等
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    // 检查是否有相应权限
                    boolean hasCameraPermission = ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
                    boolean hasMicPermission = ContextCompat.checkSelfPermission(
                            MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;

                    if (hasCameraPermission && hasMicPermission) {
                        // 授予所有请求的权限
                        request.grant(request.getResources());
                    } else {
                        // 权限未授予，拒绝请求
                        request.deny();
                        Toast.makeText(MainActivity.this, "请先授予音视频权限", Toast.LENGTH_SHORT).show();
                    }
                }
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, android.webkit.JsResult result) {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                result.confirm();
                return true;
            }
        });

        // 添加JavaScript接口，允许Web端调用原生功能
        webView.addJavascriptInterface(new NativeBridge(), "AndroidNative");

        // 加载本地HTML文件或远程URL
        // 如果是本地开发，可以加载本地服务器地址
        webView.loadUrl("http://10.0.2.2:3000"); // 10.0.2.2 是Android模拟器访问主机localhost的地址
        // 也可以加载asset目录下的HTML文件
        // webView.loadUrl("file:///android_asset/index.html");
    }

    private void requestPermissions() {
        // 需要请求的权限列表
        String[] permissions = {
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_PHONE_STATE
        };

        // 检查并请求未授予的权限
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQUEST_CODE);
                break;
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }

            if (allGranted) {
                Toast.makeText(this, "所有权限已授予", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "部分权限未授予，某些功能可能不可用", Toast.LENGTH_SHORT).show();
            }
        }
    }

    // 处理返回按钮，使WebView能够回退到上一页
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // 原生功能桥接类，提供给JavaScript调用的方法
    public class NativeBridge {
        // 获取设备信息
        @JavascriptInterface
        public String getDeviceInfo() {
            try {
                TelephonyManager telephonyManager = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
                StringBuilder deviceInfo = new StringBuilder();
                deviceInfo.append("{\n");
                deviceInfo.append("  \"deviceModel\": \"").append(Build.MODEL).append("\",\n");
                deviceInfo.append("  \"androidVersion\": \"").append(Build.VERSION.RELEASE).append("\",\n");
                deviceInfo.append("  \"manufacturer\": \"").append(Build.MANUFACTURER).append("\"\n");
                
                if (ActivityCompat.checkSelfPermission(MainActivity.this, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        deviceInfo.append(",  \"imei\": \"").append(telephonyManager.getImei()).append("\"\n");
                    }
                }
                
                deviceInfo.append("}");
                return deviceInfo.toString();
            } catch (Exception e) {
                Log.e(TAG, "获取设备信息失败", e);
                return "{\"error\": \"获取设备信息失败\"}";
            }
        }

        // 请求麦克风和摄像头权限
        @JavascriptInterface
        public boolean requestMediaPermissions() {
            boolean hasCameraPermission = ContextCompat.checkSelfPermission(
                    MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
            boolean hasMicPermission = ContextCompat.checkSelfPermission(
                    MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;

            if (!hasCameraPermission || !hasMicPermission) {
                // 在UI线程中请求权限
                runOnUiThread(() -> ActivityCompat.requestPermissions(
                        MainActivity.this, 
                        new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO},
                        PERMISSION_REQUEST_CODE
                ));
                return false; // 权限请求已发起，但尚未授予
            }
            return true; // 权限已授予
        }

        // 显示本地通知
        @JavascriptInterface
        public void showNotification(String title, String message) {
            runOnUiThread(() -> {
                Toast.makeText(MainActivity.this, title + ": " + message, Toast.LENGTH_LONG).show();
                Log.d(TAG, "显示通知: " + title + ", " + message);
                // 在实际应用中，这里可以使用NotificationManager创建系统通知
            });
        }

        // 保存聊天记录到本地存储
        @JavascriptInterface
        public boolean saveChatHistory(String chatData) {
            try {
                // 这里可以实现保存聊天记录到文件或数据库
                Log.d(TAG, "保存聊天记录: " + chatData.length() + " 字符");
                // 简单实现：保存到SharedPreferences
                getSharedPreferences("chat_history", Context.MODE_PRIVATE)
                        .edit()
                        .putString("history", chatData)
                        .apply();
                return true;
            } catch (Exception e) {
                Log.e(TAG, "保存聊天记录失败", e);
                return false;
            }
        }

        // 获取保存的聊天记录
        @JavascriptInterface
        public String getChatHistory() {
            try {
                String history = getSharedPreferences("chat_history", Context.MODE_PRIVATE)
                        .getString("history", "[]");
                Log.d(TAG, "获取聊天记录: " + history.length() + " 字符");
                return history;
            } catch (Exception e) {
                Log.e(TAG, "获取聊天记录失败", e);
                return "[]";
            }
        }
    }
}
