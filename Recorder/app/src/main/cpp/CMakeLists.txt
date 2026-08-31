cmake_minimum_required(VERSION 3.22.1)
project(whisper-jni)

set(CMAKE_CXX_STANDARD 17)

# Path to whisper.cpp source — clone into this directory:
#   cd app/src/main/cpp
#   git clone https://github.com/ggerganov/whisper.cpp.git
set(WHISPER_DIR ${CMAKE_CURRENT_SOURCE_DIR}/whisper.cpp)

# Build whisper as a static library
add_library(whisper STATIC
    ${WHISPER_DIR}/src/whisper.cpp
    ${WHISPER_DIR}/ggml/src/ggml.c
    ${WHISPER_DIR}/ggml/src/ggml-alloc.c
    ${WHISPER_DIR}/ggml/src/ggml-backend.c
    ${WHISPER_DIR}/ggml/src/ggml-backend-reg.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/ggml-cpu.c
    ${WHISPER_DIR}/ggml/src/ggml-cpu/ggml-cpu.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/ggml-cpu-aarch64.cpp
    ${WHISPER_DIR}/ggml/src/ggml-cpu/ggml-cpu-quants.c
    ${WHISPER_DIR}/ggml/src/ggml-threading.cpp
)

target_include_directories(whisper PUBLIC
    ${WHISPER_DIR}/include
    ${WHISPER_DIR}/ggml/include
    ${WHISPER_DIR}/ggml/src
    ${WHISPER_DIR}/ggml/src/ggml-cpu
    ${WHISPER_DIR}/src
)

target_compile_definitions(whisper PUBLIC
    GGML_USE_CPU
)

# JNI bridge
add_library(whisper-jni SHARED whisper_jni.cpp)
target_link_libraries(whisper-jni whisper log android)
