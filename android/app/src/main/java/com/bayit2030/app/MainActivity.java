package com.bayit2030.app;

import android.app.Activity;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.CancellationSignal;
import android.os.SystemClock;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Locked with the fingerprint (or the phone's PIN as a fallback) each time the app opens or comes back after a minute;
// until then the site is hidden. The login from the app lasts 90 days (lib/session.js APP_UA), so the fingerprint
// stands in for the password.
// The site in a full-screen WebView: the login cookie is kept, the back button goes back in the site, and links to
// other sites (sources, Interactive Brokers) open in the phone's browser.
public class MainActivity extends Activity {
    private static final String HOST = "finance.2.31.65.97.sslip.io";
    private static final long RELOCK_MS = 60_000;
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
    private WebView web;
    private boolean unlocked = false;
    private boolean asking = false;
    private long leftAt = 0;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " Bayit2030App");
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, u));
                return true;
            }
        });
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVisibility(View.INVISIBLE);
        setContentView(web);
        if (saved != null) web.restoreState(saved);
        else web.loadUrl("https://" + HOST + "/");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        if (!asking) leftAt = SystemClock.elapsedRealtime();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (unlocked && SystemClock.elapsedRealtime() - leftAt > RELOCK_MS) unlocked = false;
        if (!unlocked) lock();
    }

    private void lock() {
        web.setVisibility(View.INVISIBLE);
        if (asking) return;
        if (getSystemService(BiometricManager.class).canAuthenticate(AUTH) != BiometricManager.BIOMETRIC_SUCCESS) {
            unlock(); // no fingerprint or screen lock set on the phone: the site's own password still guards it
            return;
        }
        asking = true;
        new BiometricPrompt.Builder(this)
            .setTitle("בית 2030")
            .setSubtitle("כניסה עם טביעת אצבע")
            .setAllowedAuthenticators(AUTH)
            .build()
            .authenticate(new CancellationSignal(), getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                    asking = false;
                    unlock();
                }

                @Override
                public void onAuthenticationError(int code, CharSequence msg) {
                    asking = false;
                    finish(); // cancelled: close rather than show the site
                }
            });
    }

    private void unlock() {
        unlocked = true;
        web.setVisibility(View.VISIBLE);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
