import type { TileId } from '@dragon-rush/engine';
import type { CSSProperties, ReactNode } from 'react';
import { tileImagePath } from '../../types/assetPaths';
import { TILE_LABEL } from '../../types/labels';
import type { LandmarkKind } from '../../types/tileView';
import { AssetImage } from '../common/AssetImage';

/* Placeholder standee art drawn in the Ember Table palette until painted landmarks arrive. */

/** Moving an HTML overlay keeps the SVG's geometry static instead of relaying out the document. */
function MotionLayer({
  className,
  x,
  y,
  children,
}: {
  className: string;
  x: number;
  y: number;
  children: ReactNode;
}) {
  return (
    <span
      className={`landmark-motion-layer ${className}`}
      style={{ '--motion-x': x, '--motion-y': y } as CSSProperties}
    >
      <svg viewBox="0 0 140 130" className="landmark-svg">
        {children}
      </svg>
    </span>
  );
}

function GateArt() {
  return (
    <span className="landmark-svg-stack">
      <svg viewBox="0 0 140 130" className="landmark-svg">
        <path
          d="M8 128V40h10v-8h8v8h8v-8h8v8h10v88Z"
          fill="#7b6a58"
          stroke="#2b1d14"
          strokeWidth="3"
        />
        <path
          d="M88 128V40h10v-8h8v8h8v-8h8v8h10v88Z"
          fill="#7b6a58"
          stroke="#2b1d14"
          strokeWidth="3"
        />
        <path d="M52 128V66h36v62Z" fill="#8a7864" stroke="#2b1d14" strokeWidth="3" />
        <path
          d="M58 128v-34a12 12 0 0 1 24 0v34Z"
          fill="#1a1210"
          stroke="#2b1d14"
          strokeWidth="3"
        />
        <path
          d="M52 66h36V56h-6v6h-6v-6h-6v6h-6v-6h-6v6h-6Z"
          fill="#7b6a58"
          stroke="#2b1d14"
          strokeWidth="3"
        />
        <path d="M14 60h12M14 84h12M94 60h12M94 84h12" stroke="#4a3a2c" strokeWidth="3" />
      </svg>
      <MotionLayer className="landmark-flag" x={30} y={32}>
        <path d="M30 32V4" stroke="#2b1d14" strokeWidth="3" />
        <path d="M31 5h26l-6 7 6 7H31Z" fill="#c8402a" stroke="#2b1d14" strokeWidth="2.5" />
      </MotionLayer>
      <MotionLayer className="landmark-flag landmark-flag-2" x={110} y={32}>
        <path d="M110 32V4" stroke="#2b1d14" strokeWidth="3" />
        <path d="M111 5h26l-6 7 6 7h-26Z" fill="#d9a441" stroke="#2b1d14" strokeWidth="2.5" />
      </MotionLayer>
    </span>
  );
}

function TentArt() {
  return (
    <svg viewBox="0 0 140 130" className="landmark-svg">
      <path
        d="M70 6 6 92h128Z"
        fill="#ead9b5"
        stroke="#2b1d14"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M70 6 38 92h16L70 6l16 86h16Z"
        fill="#c8402a"
        stroke="#2b1d14"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M10 92h120v8H10Z" fill="#5a3a22" stroke="#2b1d14" strokeWidth="3" />
      <path d="M24 100v28M116 100v28" stroke="#3b2618" strokeWidth="6" />
      <path d="M20 108h100v20H20Z" fill="#8a5a32" stroke="#2b1d14" strokeWidth="3" />
      <circle cx="44" cy="104" r="6" fill="#d9a441" stroke="#2b1d14" strokeWidth="2" />
      <circle cx="96" cy="104" r="6" fill="#2f78d6" stroke="#2b1d14" strokeWidth="2" />
      <path d="M62 96h16v8H62Z" fill="#6b4fa8" stroke="#2b1d14" strokeWidth="2" />
      <g className="landmark-lantern">
        <path d="M118 52v12" stroke="#2b1d14" strokeWidth="2.5" />
        <circle
          className="landmark-lantern-glow"
          cx="118"
          cy="72"
          r="14"
          fill="#ffb25b"
          opacity="0.35"
        />
        <path d="M112 64h12l-2 16h-8Z" fill="#ffb25b" stroke="#2b1d14" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

function InnArt() {
  return (
    <span className="landmark-svg-stack">
      <svg viewBox="0 0 140 130" className="landmark-svg">
        <path d="M98 30h14v34H98Z" fill="#7b6a58" stroke="#2b1d14" strokeWidth="3" />
        <path
          d="M8 66 70 18l62 48Z"
          fill="#8a3a22"
          stroke="#2b1d14"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M20 66h100v62H20Z" fill="#ead9b5" stroke="#2b1d14" strokeWidth="3" />
        <path d="M20 66l100 62M120 66 20 128M70 66v62M20 96h100" stroke="#5a3a22" strokeWidth="4" />
        <path d="M58 98h24v30H58Z" fill="#3b2618" stroke="#2b1d14" strokeWidth="3" />
        <path
          d="M30 76h18v14H30ZM92 76h18v14H92Z"
          fill="#ffb25b"
          stroke="#2b1d14"
          strokeWidth="3"
          className="landmark-window"
        />
        <path d="M60 44h20v12H60Z" fill="#d9a441" stroke="#2b1d14" strokeWidth="2.5" />
      </svg>
      <MotionLayer className="landmark-smoke-puff" x={105} y={22}>
        <circle cx="105" cy="22" r="6" />
      </MotionLayer>
      <MotionLayer className="landmark-smoke-puff landmark-smoke-puff-2" x={110} y={12}>
        <circle cx="110" cy="12" r="5" />
      </MotionLayer>
      <MotionLayer className="landmark-smoke-puff landmark-smoke-puff-3" x={104} y={4}>
        <circle cx="104" cy="4" r="4" />
      </MotionLayer>
    </span>
  );
}

const ART = { gate: GateArt, tent: TentArt, inn: InnArt } as const;

interface LandmarkProps {
  kind: LandmarkKind;
  tileId: TileId;
}

/** Corner landmark standee that billboards toward the camera, with a small idle loop. */
export function Landmark({ kind, tileId }: LandmarkProps) {
  const Art = ART[kind];
  return (
    <div className={`landmark landmark-${kind}`} aria-hidden="true">
      <div className="landmark-stand">
        <AssetImage
          className="landmark-art"
          path={tileImagePath(tileId)}
          fallback={<Art />}
          alt={TILE_LABEL[tileId]}
        />
      </div>
    </div>
  );
}
