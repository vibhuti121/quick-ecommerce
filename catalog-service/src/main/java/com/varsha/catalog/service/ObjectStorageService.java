package com.varsha.catalog.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.PutBucketPolicyRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * Stores and serves product images in MinIO (Phase 2, Pillar 4).
 *
 * <p>Product images are public assets (a storefront shows them to anyone), so the bucket is given an
 * anonymous {@code s3:GetObject} policy and URLs are stable — no per-request presigning. Uploads use
 * the in-network {@code endpoint}; the returned URL uses {@code public-url} so a browser on the host
 * can fetch it. Access control stays on the WRITE path (admin endpoint behind the gateway), which is
 * the correct boundary for catalog images.
 */
@Service
public class ObjectStorageService {

    private static final Logger log = LoggerFactory.getLogger(ObjectStorageService.class);

    private final S3Client s3;
    private final String bucket;
    private final String publicBaseUrl;

    public ObjectStorageService(
            S3Client s3,
            @Value("${app.minio.bucket}") String bucket,
            @Value("${app.minio.public-url}") String publicBaseUrl) {
        this.s3 = s3;
        this.bucket = bucket;
        // Strip any trailing slash so publicUrl() never produces a double slash.
        this.publicBaseUrl = publicBaseUrl.endsWith("/")
                ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1)
                : publicBaseUrl;
    }

    /**
     * Creates the bucket if absent and (re)applies a public read-only policy. Idempotent — safe to
     * call on every startup. Throws if MinIO is unreachable so the caller can retry.
     */
    public void ensureBucket() {
        try {
            s3.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
        } catch (NoSuchBucketException e) {
            log.info("Creating object-storage bucket '{}'", bucket);
            s3.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
        }
        s3.putBucketPolicy(PutBucketPolicyRequest.builder()
                .bucket(bucket)
                .policy(publicReadPolicy())
                .build());
    }

    /** Uploads bytes under {@code key} and returns the browser-facing URL. */
    public String upload(String key, byte[] data, String contentType) {
        s3.putObject(
                PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .contentType(contentType)
                        .build(),
                RequestBody.fromBytes(data));
        return publicUrl(key);
    }

    /** Stable, browser-facing URL for an object key (path-style: {@code host/bucket/key}). */
    public String publicUrl(String key) {
        return publicBaseUrl + "/" + bucket + "/" + key;
    }

    private String publicReadPolicy() {
        // Anonymous GetObject on everything in this bucket — product images are public assets.
        return """
                {
                  "Version": "2012-10-17",
                  "Statement": [
                    {
                      "Effect": "Allow",
                      "Principal": "*",
                      "Action": ["s3:GetObject"],
                      "Resource": ["arn:aws:s3:::%s/*"]
                    }
                  ]
                }
                """.formatted(bucket);
    }
}
