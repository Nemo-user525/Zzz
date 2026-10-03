import './jianwei-phone-scenery.css';

/** Illustrations stay behind the device and follow the three steps of an investigation. */
export function JianweiPhoneScenery({ stage }: { stage: 0 | 1 | 2 }) {
  return <div className="jw-phone-scenery" data-scene={stage} aria-hidden="true">
    <div className="jw-phone-landscape jw-phone-landscape-store" data-active={stage === 0}>
      <svg viewBox="0 0 600 760" fill="none" className="jw-phone-scenery-art">
        <ellipse className="jw-scenery-orbit" cx="305" cy="370" rx="280" ry="286"/>
        <g className="jw-scenery-far">
          <path className="jw-scenery-ground" d="M3 558C117 530 189 581 302 554S473 530 597 553"/>
          <path className="jw-scenery-faint" d="M11 571C143 543 208 593 327 568S481 548 589 566"/>
          <g transform="translate(429 280)">
            <path className="jw-scenery-building" d="M0 9 137 0v227L0 240Z"/>
            <path className="jw-scenery-line" d="m0 9 12-14 137-8-12 13M137 0l12-13v226l-12 14M19 49l36-2v43l-36 3ZM77 44l36-2v43l-36 3ZM19 116l36-2v43l-36 3ZM77 112l36-2v43l-36 3ZM47 180l40-3v53"/>
            <path className="jw-scenery-faint" d="m20 64 34-2m24-2 34-2M20 132l34-2m24-2 34-2"/>
          </g>
        </g>
        <g className="jw-scenery-near">
          <g transform="translate(1 219) rotate(-6 76 100)">
            <rect className="jw-scenery-paper" x="4" y="30" width="162" height="202" rx="3"/>
            <path className="jw-scenery-blue-fill" d="M-4 57h177l-14-29H10Z"/>
            <path className="jw-scenery-line" d="M-4 57h177M-4 57v17c0 14 23 14 23 0 0 14 22 14 22 0 0 14 22 14 22 0 0 14 22 14 22 0 0 14 22 14 22 0 0 14 22 14 22 0 0 14 22 14 22 0 0 14 22 14 22 0V57M19 57l8-29m14 29 5-29m17 29 3-29m19 29V28m22 29-3-29m25 29-6-29m28 29-9-29"/>
            <rect className="jw-scenery-window" x="21" y="103" width="77" height="68" rx="1"/>
            <path className="jw-scenery-line" d="M112 232V102h35v130M127 160h6M59 105v65M6 194h91M7 205h90"/>
            <rect className="jw-scenery-paper" x="31" y="5" width="106" height="32" rx="2"/>
            <text x="84" y="26" textAnchor="middle" className="jw-scenery-label">一 家 门 店</text>
          </g>
          <path className="jw-scenery-drawn" pathLength="1" d="M39 163c0-22 34-35 55-20 25 19 6 48-11 65-20-17-44-29-44-45Z"/>
          <circle className="jw-scenery-dot" cx="68" cy="164" r="5"/>
          <path className="jw-scenery-faint" d="M473 619h63m-31-31v63M61 591h35m-18-18v36"/>
        </g>
      </svg>
    </div>
    <div className="jw-phone-landscape jw-phone-landscape-evidence" data-active={stage === 1}>
      <svg viewBox="0 0 600 760" fill="none" className="jw-phone-scenery-art">
        <ellipse className="jw-scenery-orbit" cx="303" cy="360" rx="282" ry="264"/>
        <g className="jw-scenery-far">
          <path className="jw-scenery-connection" pathLength="1" d="M53 229C-2 399 118 528 212 544S512 631 556 451 510 194 388 163 99 92 53 229Z"/>
          <path className="jw-scenery-faint" d="M55 232 283 339 540 447M80 532 283 339 512 209" strokeDasharray="3 8"/>
          <circle className="jw-scenery-paper" cx="518" cy="205" r="34"/>
          <path className="jw-scenery-line" d="M506 194h22v20h-22zm-6 26h34m-18-23v4m5-4v4m-5 5v4m5-4v4"/>
          <circle className="jw-scenery-paper" cx="86" cy="550" r="24"/>
          <path className="jw-scenery-line" d="m76 550 7 7 13-15"/>
          <circle className="jw-scenery-dot" cx="388" cy="163" r="5"/>
          <circle className="jw-scenery-dot" cx="211" cy="544" r="4"/>
        </g>
        <g className="jw-scenery-near">
          <g transform="translate(-7 175) rotate(-10 75 82)">
            <path className="jw-scenery-paper" d="M0 0h108l27 27v143H0Z"/>
            <path className="jw-scenery-line" d="M108 0v27h27M19 48h88M19 74h77M19 87h92M19 100h68M19 130h30"/>
            <text x="19" y="31" className="jw-scenery-small-label">SOURCE 01</text>
            <circle className="jw-scenery-stamp" cx="98" cy="133" r="20"/>
            <path className="jw-scenery-line" d="m88 133 7 7 14-16"/>
          </g>
          <g transform="translate(462 399) rotate(8 60 86)">
            <rect className="jw-scenery-paper" width="130" height="166" rx="2"/>
            <rect className="jw-scenery-blue-fill" x="16" y="17" width="98" height="30" rx="1"/>
            <path className="jw-scenery-line" d="M18 68h77M18 81h94M18 94h68M18 124h58M18 138h91"/>
            <text x="29" y="37" className="jw-scenery-small-label">RECORD 02</text>
          </g>
          <circle className="jw-scenery-node" cx="46" cy="230" r="7"/>
          <circle className="jw-scenery-node" cx="545" cy="448" r="7"/>
          <path className="jw-scenery-drawn" pathLength="1" d="M7 396c20-16 37-18 58-10m-10-10 11 10-13 5M514 611c19 4 43-3 56-17m-13 1 14-2-2 14"/>
        </g>
      </svg>
    </div>
    <div className="jw-phone-landscape jw-phone-landscape-check" data-active={stage === 2}>
      <svg viewBox="0 0 600 760" fill="none" className="jw-phone-scenery-art">
        <ellipse className="jw-scenery-orbit" cx="303" cy="377" rx="279" ry="267"/>
        <g className="jw-scenery-far">
          <path className="jw-scenery-ground" d="M12 581c161 26 368 28 576-2"/>
          <path className="jw-scenery-faint" d="M23 593c169 24 348 21 553-1"/>
          <g transform="translate(434 206) rotate(9 68 110)">
            <rect className="jw-scenery-building" x="-13" y="12" width="145" height="214" rx="4"/>
            <rect className="jw-scenery-paper" width="145" height="214" rx="4"/>
            <rect className="jw-scenery-blue-fill" x="35" y="-8" width="76" height="23" rx="4"/>
            <text x="20" y="49" className="jw-scenery-label">核 对 清 单</text>
            <path className="jw-scenery-line" d="M50 79h70M50 91h49M50 125h70M50 137h54M50 171h70M50 183h38"/>
            <rect className="jw-scenery-window" x="19" y="73" width="18" height="18" rx="3"/>
            <rect className="jw-scenery-window" x="19" y="119" width="18" height="18" rx="3"/>
            <rect className="jw-scenery-window" x="19" y="165" width="18" height="18" rx="3"/>
            <path className="jw-scenery-drawn" pathLength="1" d="m23 80 4 5 7-10m-11 51 4 5 7-10"/>
          </g>
        </g>
        <g className="jw-scenery-near">
          <g transform="translate(-6 379) rotate(-9 75 88)">
            <rect className="jw-scenery-building" x="8" y="8" width="148" height="170" rx="3"/>
            <rect className="jw-scenery-paper" width="148" height="170" rx="3"/>
            <text x="19" y="34" className="jw-scenery-small-label">YOUR NEXT STEP</text>
            <path className="jw-scenery-line" d="M19 48h110M19 77h83M19 92h106M19 107h91"/>
            <path className="jw-scenery-drawn" pathLength="1" d="M24 140h81m-11-9 12 9-12 9"/>
          </g>
          <circle className="jw-scenery-stamp" cx="78" cy="233" r="35"/>
          <path className="jw-scenery-drawn" pathLength="1" d="m62 233 11 11 23-27"/>
          <path className="jw-scenery-line" d="m514 519 24-6-3 25m3-25-43 50"/>
          <path className="jw-scenery-faint" d="M499 593h65M70 601h41m-21-20v40"/>
          <circle className="jw-scenery-dot" cx="556" cy="474" r="4"/>
        </g>
      </svg>
    </div>
  </div>;
}
