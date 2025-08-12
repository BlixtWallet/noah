#include <jni.h>
#include "noahtoolsOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::noahtools::initialize(vm);
}
