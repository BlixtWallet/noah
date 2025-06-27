package com.anonymous.noah

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class AppVariantModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AppVariant"

    override fun getConstants(): Map<String, Any> {
        val constants = HashMap<String, Any>()
        constants["APP_VARIANT"] = BuildConfig.APP_VARIANT
        return constants
    }
}