package com.greyspear.recorder.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class CryptoManager {

    companion object {
        private const val TAG = "CryptoManager"
        private const val KEYSTORE_ALIAS = "recorder_file_key"
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_IV_SIZE = 12
        private const val GCM_TAG_BITS = 128
    }

    private fun getOrCreateKey(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }

        ks.getEntry(KEYSTORE_ALIAS, null)?.let { entry ->
            return (entry as KeyStore.SecretKeyEntry).secretKey
        }

        val spec = KeyGenParameterSpec.Builder(
            KEYSTORE_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()

        val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        keyGen.init(spec)
        val key = keyGen.generateKey()
        Log.i(TAG, "Generated new Keystore key")
        return key
    }

    fun encryptFile(plainFile: File, encryptedFile: File) {
        val key = getOrCreateKey()
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val iv = cipher.iv

        FileInputStream(plainFile).use { fis ->
            FileOutputStream(encryptedFile).use { fos ->
                fos.write(iv)

                val buf = ByteArray(8192)
                var read: Int
                while (fis.read(buf).also { read = it } != -1) {
                    val enc = cipher.update(buf, 0, read)
                    if (enc != null) fos.write(enc)
                }
                val finalBlock = cipher.doFinal()
                if (finalBlock != null) fos.write(finalBlock)
            }
        }

        Log.i(TAG, "Encrypted ${plainFile.name} → ${encryptedFile.name}")
    }

    fun decryptFile(encryptedFile: File, plainFile: File) {
        val key = getOrCreateKey()

        FileInputStream(encryptedFile).use { fis ->
            val iv = ByteArray(GCM_IV_SIZE)
            fis.read(iv)

            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))

            FileOutputStream(plainFile).use { fos ->
                val buf = ByteArray(8192)
                var read: Int
                while (fis.read(buf).also { read = it } != -1) {
                    val dec = cipher.update(buf, 0, read)
                    if (dec != null) fos.write(dec)
                }
                val finalBlock = cipher.doFinal()
                if (finalBlock != null) fos.write(finalBlock)
            }
        }

        Log.i(TAG, "Decrypted ${encryptedFile.name} → ${plainFile.name}")
    }

    fun decryptToTempFile(encryptedFile: File, cacheDir: File): File {
        val tmp = File(cacheDir, "dec_${System.currentTimeMillis()}.wav")
        decryptFile(encryptedFile, tmp)
        return tmp
    }
}
