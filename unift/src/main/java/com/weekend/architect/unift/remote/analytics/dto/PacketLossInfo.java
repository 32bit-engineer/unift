package com.weekend.architect.unift.remote.analytics.dto;

import lombok.Builder;
import lombok.Value;

/** Packet-loss statistics derived from a local ICMP ping probe to the remote host. */
@Value
@Builder
public class PacketLossInfo {

    /** Percentage of packets that did not receive a reply (0.0 – 100.0). */
    double lossPercent;

    /** Total ICMP packets transmitted. */
    int packetsSent;

    /** ICMP packets that received a reply. */
    int packetsReceived;

    /** {@code true} when the ping probe could not be executed on this host. */
    boolean unavailable;

    /** Zero-loss sentinel (used when ping is blocked or unavailable). */
    public static PacketLossInfo unavailable() {
        return PacketLossInfo.builder()
                .lossPercent(0.0)
                .packetsSent(0)
                .packetsReceived(0)
                .unavailable(true)
                .build();
    }
}
