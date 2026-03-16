package com.weekend.architect.unift.common.utils;

public class StringUtils {
    private StringUtils() {}

    public static boolean isBlank(String string) {
        return string == null || string.isBlank();
    }
}
