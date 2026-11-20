package com.lumen.notes;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Enable cookies and third-party cookies in WebView
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            cookieManager.setAcceptThirdPartyCookies(this.bridge.getWebView(), true);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Flush cookies to persistent disk storage when app goes to background / closes
        CookieManager.getInstance().flush();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        // Flush cookies on destroy
        CookieManager.getInstance().flush();
    }
}
