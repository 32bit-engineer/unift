package com.weekend.architect.unift.remote.model;

import com.jcraft.jsch.UIKeyboardInteractive;
import com.jcraft.jsch.UserInfo;
import java.util.Arrays;

/**
 * Supplies a known password to JSch for both the {@code password} and
 * {@code keyboard-interactive} SSH auth methods.
 *
 * <p>Many Linux servers (Ubuntu/Debian with {@code UsePAM yes}) disable the raw
 * {@code password} method and only accept {@code keyboard-interactive} (PAM).
 * OpenSSH's CLI client handles this transparently; JSch requires an explicit
 * {@link UserInfo} + {@link UIKeyboardInteractive} implementation to do the same.
 */
public record PasswordUserInfo(String password) implements UserInfo, UIKeyboardInteractive {

    @Override
    public String[] promptKeyboardInteractive(
            String destination, String name, String instruction, String[] prompt, boolean[] echo) {
        // The server may send multiple prompts (e.g. OTP after password).
        // Fill every slot with the password — for plain PAM there is always exactly one prompt.
        String[] responses = new String[prompt.length];
        Arrays.fill(responses, password);
        return responses;
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public boolean promptPassword(String message) {
        return true;
    }

    @Override
    public String getPassphrase() {
        return null;
    }

    @Override
    public boolean promptPassphrase(String message) {
        return false;
    }

    @Override
    public boolean promptYesNo(String message) {
        return false;
    }

    @Override
    public void showMessage(String message) {
        // left blank intentionally
    }
}
