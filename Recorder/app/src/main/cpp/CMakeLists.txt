cmake_minimum_required(VERSION 3.22.1)
project(whisper-jni)

set(CMAKE_CXX_STANDARD 17)

# whisper.cpp configuration
# Force off tests and examples as we only need the library
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "Build tests" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "Build examples" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "Build server example" FORCE)

# Add whisper.cpp as a subdirectory
add_subdirectory(whisper.cpp)

# JNI bridge
add_library(whisper-jni SHARED whisper_jni.cpp)

# Link against the whisper library and Android logging/system libs
# Note: the whisper target is defined in whisper.cpp/src/CMakeLists.txt
target_link_libraries(whisper-jni
    whisper
    log
    android
)

# Ensure the JNI bridge can find whisper.h
# whisper target already exports its include directory, but we can be explicit if needed
target_include_directories(whisper-jni PRIVATE
    whisper.cpp/include
)
