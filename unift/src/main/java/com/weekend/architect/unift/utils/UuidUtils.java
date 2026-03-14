package com.weekend.architect.unift.utils;

import com.github.f4b6a3.uuid.UuidCreator;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@NoArgsConstructor(access = AccessLevel.PRIVATE)
public class UuidUtils {

    public static UUID uuidVersion7() {
        return UuidCreator.getTimeOrderedEpoch();
    }

    public static UUID uuidVersion4() {
        return UUID.randomUUID();
    }
}
