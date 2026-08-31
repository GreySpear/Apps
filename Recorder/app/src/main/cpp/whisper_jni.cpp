#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include "whisper.h"

#define TAG "WhisperJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static whisper_context *g_ctx = nullptr;

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_greyspear_recorder_whisper_WhisperLib_initContext(
        JNIEnv *env, jobject, jstring modelPath) {
    const char *path = env->GetStringUTFChars(modelPath, nullptr);
    LOGI("Loading model: %s", path);

    struct whisper_context_params params = whisper_context_default_params();
    whisper_context *ctx = whisper_init_from_file_with_params(path, params);
    env->ReleaseStringUTFChars(modelPath, path);

    if (!ctx) {
        LOGE("Failed to init whisper context");
        return 0;
    }

    LOGI("Model loaded successfully");
    return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT void JNICALL
Java_com_greyspear_recorder_whisper_WhisperLib_freeContext(
        JNIEnv *, jobject, jlong ctxPtr) {
    auto *ctx = reinterpret_cast<whisper_context *>(ctxPtr);
    if (ctx) {
        whisper_free(ctx);
        LOGI("Context freed");
    }
}

JNIEXPORT jstring JNICALL
Java_com_greyspear_recorder_whisper_WhisperLib_transcribe(
        JNIEnv *env, jobject, jlong ctxPtr, jfloatArray samples, jint nThreads) {
    auto *ctx = reinterpret_cast<whisper_context *>(ctxPtr);
    if (!ctx) {
        return env->NewStringUTF("");
    }

    jsize n = env->GetArrayLength(samples);
    jfloat *data = env->GetFloatArrayElements(samples, nullptr);

    LOGI("Transcribing %d samples with %d threads", n, nThreads);

    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = nThreads;
    params.print_progress = false;
    params.print_timestamps = false;
    params.single_segment = false;
    params.language = "en";

    int ret = whisper_full(ctx, params, data, n);
    env->ReleaseFloatArrayElements(samples, data, JNI_ABORT);

    if (ret != 0) {
        LOGE("whisper_full failed: %d", ret);
        return env->NewStringUTF("");
    }

    int nSegments = whisper_full_n_segments(ctx);
    std::string result;
    for (int i = 0; i < nSegments; i++) {
        const char *text = whisper_full_get_segment_text(ctx, i);
        if (text) {
            result += text;
        }
    }

    LOGI("Transcription complete: %d segments, %zu chars", nSegments, result.size());
    return env->NewStringUTF(result.c_str());
}

}
