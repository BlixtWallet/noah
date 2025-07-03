package com.margelo.nitro.noahtools

import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class NoahTools : HybridNoahToolsSpec() {
  override fun getAppVariant(): String {
    val buildConfigClass = Class.forName("com.anonymous.noah.BuildConfig")
    val field = buildConfigClass.getField("APP_VARIANT")

    val appVariant = field.get(null) as? String
    if (appVariant != null) {
      return appVariant
    } else {
      throw Error(
        "NoahTools: Can't find BuildConfig field APP_VARIANT. Is the current app variant properly set?"
      )
    }
  }
}
