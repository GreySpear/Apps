package com.greyspear.recorder.whisper

import android.util.Log

class WhisperLib {

    companion object {
        private const val TAG = "WhisperLib"

        init {
            try {
                System.loadLibrary("whisper-jni")
                Log.i(TAG, "Native library loaded")
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Failed to load native library", e)
            }
        }
    }

    external fun initContext(modelPath: String): Long
    external fun freeContext(ctxPtr: Long)
    external fun transcribe(ctxPtr: Long, samples: FloatArray, nThreads: Int): String
}
