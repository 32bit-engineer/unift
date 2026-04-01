package com.weekend.architect.unift.remote.core;

import com.weekend.architect.unift.remote.exception.TransferException;
import java.io.InputStream;

/**
 * Capability interface for streaming file transfers to / from a remote host.
 *
 * <p>Both methods use raw {@link InputStream} so that the connection layer stays decoupled from
 * Spring types ({@code MultipartFile}, {@code StreamingResponseBody}). The service layer wraps
 * these streams into the appropriate HTTP response.
 */
public interface FileTransferable {

    /**
     * Uploads a file to the remote host.
     *
     * @param remotePath target path on the remote host (must include filename)
     * @param source input stream of file content; the caller is responsible for closing it after
     *     this method returns
     * @param fileSize total size in bytes; pass {@code -1} if unknown
     * @param callback progress listener; use {@link TransferProgressCallback#noop()} if unneeded
     * @param cancellationToken optional token that can stop the transfer mid-flight; pass {@code
     *     null} for non-cancellable uploads
     * @throws TransferException if the upload fails
     */
    void upload(
            String remotePath,
            InputStream source,
            long fileSize,
            TransferProgressCallback callback,
            CancellationToken cancellationToken)
            throws TransferException;

    /**
     * Opens a streaming download from the remote host.
     *
     * <p>The caller <strong>must</strong> close the returned {@link InputStream} when done to
     * release the underlying channel resources.
     *
     * @param remotePath source path on the remote host
     * @param callback progress listener
     * @return a live {@link InputStream} backed by the remote connection
     * @throws TransferException if the download cannot be initiated
     */
    InputStream download(String remotePath, TransferProgressCallback callback) throws TransferException;
}
