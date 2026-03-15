package com.weekend.architect.unift.remote.core;

import com.weekend.architect.unift.remote.exception.BrowseException;
import com.weekend.architect.unift.remote.model.RemoteFile;
import java.util.List;

/**
 * Capability interface for browsing and mutating a remote file-system hierarchy.
 *
 * <p>Implementations must be thread-safe: multiple request threads may invoke
 * these methods concurrently on the same connection handle.
 */
public interface DirectoryBrowsable {

    /**
     * Lists all entries (files, directories, symlinks) at the given remote path.
     *
     * @param remotePath absolute path on the remote host
     * @return unordered list of entries; never {@code null}
     * @throws BrowseException if the path does not exist or cannot be read
     */
    List<RemoteFile> list(String remotePath) throws BrowseException;

    /**
     * Deletes a single file or an empty directory at the given path.
     *
     * @throws BrowseException if the path does not exist or deletion fails
     */
    void delete(String remotePath) throws BrowseException;

    /**
     * Renames / moves {@code remotePath} to {@code newPath}.
     *
     * @param remotePath absolute path of the source entry
     * @param newPath    absolute path of the destination (must be on same host)
     * @throws BrowseException if the operation fails
     */
    void rename(String remotePath, String newPath) throws BrowseException;

    /**
     * Creates a directory (and any missing parents) at the given path.
     *
     * @throws BrowseException if creation fails
     */
    void mkdir(String remotePath) throws BrowseException;

    /**
     * Returns the home directory of the authenticated remote user.
     *
     * @throws BrowseException if the home directory cannot be determined
     */
    String homeDirectory() throws BrowseException;
}
