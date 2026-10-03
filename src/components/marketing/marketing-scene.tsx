"use client";

import { useRef, useState, type PointerEvent } from "react";
import { ArrowUp, Check, PackageCheck, Pause, Play, ShieldCheck } from "lucide-react";
import styles from "./marketing-scene.module.css";

const shieldOutline = "M80 8C105 22 126 27 148 29V82C148 127 120 162 80 184C40 162 12 127 12 82V29C34 27 55 22 80 8Z";

function Parcel({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? styles.smallParcelFloat : styles.parcelFloat}>
      <div className={styles.parcel}>
        <div className={[styles.face, styles.parcelBack].join(" ")} />
        <div className={[styles.face, styles.parcelLeft].join(" ")} />
        <div className={[styles.face, styles.parcelBottom].join(" ")} />
        <div className={[styles.face, styles.parcelRight].join(" ")}>
          <div className={styles.handling}><ArrowUp /><ArrowUp /></div>
          <span className={styles.sideRule} />
        </div>
        <div className={[styles.face, styles.parcelTop].join(" ")}>
          <span className={styles.topSeam} />
          <span className={styles.tape} />
        </div>
        <div className={[styles.face, styles.parcelFront].join(" ")}>
          <span className={styles.tape} />
          <ShieldCheck className={styles.boxLogo} strokeWidth={1.5} />
          <div className={styles.shippingLabel}>
            <strong>STOCK IN</strong>
            <span>HANDLE WITH CARE</span>
            <span className={styles.barcode} />
          </div>
          <span className={styles.boxNumber}>CB / 01</span>
        </div>
      </div>
    </div>
  );
}

function Shield() {
  return (
    <div className={styles.shieldFloat}>
      <div className={styles.shield}>
        {Array.from({ length: 12 }, (_, index) => (
          <svg
            key={index}
            viewBox="0 0 160 192"
            className={styles.shieldSlice}
            style={{ transform: "translateZ(" + index * 0.085 + "em)" }}
          >
            <path d={shieldOutline} fill={index < 6 ? "#0c2908" : "#2e5722"} />
          </svg>
        ))}
        <svg viewBox="0 0 160 192" className={styles.shieldFront}>
          <defs>
            <linearGradient id="marketing-shield-surface" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#4c7839" />
              <stop offset=".45" stopColor="#244d18" />
              <stop offset="1" stopColor="#163300" />
            </linearGradient>
          </defs>
          <path d={shieldOutline} fill="url(#marketing-shield-surface)" stroke="#73965c" strokeWidth="1.5" />
          <path d={shieldOutline} fill="none" stroke="#a9cb8d" strokeOpacity=".3" strokeWidth="1.5" transform="translate(8 10) scale(.9)" />
          <path d="m49 92 21 22 43-49" fill="none" stroke="#112e08" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 3)" />
          <path d="m49 92 21 22 43-49" fill="none" stroke="#b7f58e" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function Coin({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? styles.smallCoinFloat : styles.coinFloat}>
      <div className={styles.coin}>
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            className={styles.coinEdge}
            style={{ transform: "translateZ(" + index * 0.09 + "em)" }}
          />
        ))}
        <span className={styles.coinFront}><span>₹</span></span>
      </div>
    </div>
  );
}

function Receipt() {
  return (
    <div className={styles.receiptFloat}>
      <div className={styles.receipt}>
        <div className={styles.receiptHeading}><ShieldCheck /><span>CLAIMBACK</span></div>
        <p className={styles.receiptTitle}>THE EVIDENCE</p>
        <div className={styles.receiptRule} />
        <span className={styles.receiptRow}><span>Promise</span><Check /></span>
        <span className={styles.receiptRow}><span>Invoice</span><Check /></span>
        <span className={styles.receiptRow}><span>Delivery</span><Check /></span>
        <div className={styles.receiptRule} />
        <span className={styles.receiptStamp}><ShieldCheck /> ALL CONNECTED</span>
        <div className={styles.receiptBarcode} />
      </div>
    </div>
  );
}

export function MarketingScene() {
  const rigRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  function resetTilt() {
    rigRef.current?.style.setProperty("--scene-pitch", "0deg");
    rigRef.current?.style.setProperty("--scene-yaw", "0deg");
  }

  function tiltScene(event: PointerEvent<HTMLDivElement>) {
    if (paused || event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    rigRef.current?.style.setProperty("--scene-pitch", String(-y * 7) + "deg");
    rigRef.current?.style.setProperty("--scene-yaw", String(x * 9) + "deg");
  }

  return (
    <figure className={styles.scene} data-paused={paused}>
      <div className={styles.sceneLabel} aria-hidden="true"><span /> A LITTLE PROTECTION. A LOT OF MARGIN.</div>
      <div className={styles.viewport} onPointerMove={tiltScene} onPointerLeave={resetTilt} aria-hidden="true">
        <div className={styles.world}>
          <div className={styles.halo} />
          <div className={styles.orbit} />
          <div className={styles.ground} />
          <div className={styles.groundRing} />
          <div ref={rigRef} className={styles.rig}>
            <Parcel small />
            <Receipt />
            <Coin small />
            <Parcel />
            <Shield />
            <Coin />
          </div>
          <div className={styles.evidenceTag}><span><Check /></span><div>Evidence connected<strong>Promise → invoice → delivery</strong></div></div>
          <div className={styles.recoveryTag}><span><PackageCheck /></span><div>Potential recovery<strong>₹3,218<span> / demo example</span></strong></div></div>
          <span className={styles.sceneIndex}>01 — FROM STOCK TO CERTAINTY</span>
        </div>
      </div>
      <div className={styles.mobileProof}>
        <span><PackageCheck aria-hidden="true" /> Evidence connected</span>
        <strong>₹3,218 <span>potential recovery in the demo</span></strong>
      </div>
      <figcaption className={styles.caption}>
        <span className="sr-only">Dimensional stock parcels, a receipt and rupee coins surround a protective shield.</span>
        <span><span className={styles.captionDot} /> Illustrative scene · synthetic demo evidence</span>
        <button
          type="button"
          className={styles.motionToggle}
          aria-label={paused ? "Play illustration animation" : "Pause illustration animation"}
          onClick={() => { resetTilt(); setPaused(!paused); }}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          <span>{paused ? "Play" : "Pause"} motion</span>
        </button>
      </figcaption>
    </figure>
  );
}
