package com.veda.mobile

import android.content.Context
import com.squareup.okhttp3.OkHttpClient
import com.squareup.okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Retrofit API client for the VEEDA backend.
 *
 * Base URL is configured per environment:
 *   - Emulator: http://10.0.2.2:5000/api
 *   - Production: https://api.veeda.app/api
 *
 * The caller (web layer via Capacitor bridge) uses this client to send
 * authenticated requests using the JWT bearer token stored in SecureStorage.
 *
 * Safety note: Never send unvalidated clinical output; always surface
 * "not available, seek medical care if needed" when data is missing.
 */
object ApiClient {

    private const val BASE_URL_EMULATOR = "http://10.0.2.2:5000/api/"
    private const val BASE_URL_PRODUCTION = "https://api.veeda.app/api/"

    private var retrofit: Retrofit? = null

    fun init(context: Context, environment: String = "emulator") {
        if (retrofit != null) return

        val baseUrl = when (environment) {
            "production" -> BASE_URL_PRODUCTION
            else -> BASE_URL_EMULATOR
        }

        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(logging)
            .addInterceptor { chain ->
                val original = chain.request()
                val token = SecureStorage.getJwt(context)
                val request = original.newBuilder()
                    .header("Authorization", "Bearer $token")
                    .method(original.method, original.body)
                    .build()
                chain.proceed(request)
            }
            .build()

        retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    fun createApiService(): ApiService? {
        return retrofit?.create(ApiService::class.java)
    }

    interface ApiService {
        @POST("auth/register")
        suspend fun register(@Body body: Map<String, String>): retrofit2.Response<AuthResponse>

        @POST("auth/login")
        suspend fun login(@Body body: Map<String, String>): retrofit2.Response<AuthResponse>

        @GET("auth/me")
        suspend fun me(): retrofit2.Response<AuthResponse>

        @GET("map/nearby")
        suspend fun nearby(
            @Query("lat") lat: Double,
            @Query("lng") lng: Double,
            @Query("radius") radius: Double = 5.0
        ): retrofit2.Response<NearbyResponse>

        @POST("chat/message")
        suspend fun sendMessage(@Body body: Map<String, String>): retrofit2.Response<ChatResponse>
    }

    data class AuthResponse(
        val token: String?,
        val userId: String?,
        val message: String?
    )

    data class NearbyResponse(
        val hospitals: List<String>,
        val pharmacies: List<String>,
        val message: String?
    )

    data class ChatResponse(
        val reply: String?,
        val scores: Scores?,
        val doNow: String?,
        val watch: String?,
        val escalate: Boolean?
    )

    data class Scores(
        val risk: Double?,
        val severity: String?
    )
}