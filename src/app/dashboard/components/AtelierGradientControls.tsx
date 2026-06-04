import type { Dispatch, SetStateAction } from "react";
import type { AtelierOverlayGradientConfig } from "../../components/AtelierOverlayEditor";

type AtelierGradientControlsProps = {
  gradients: AtelierOverlayGradientConfig;
  onChange: Dispatch<SetStateAction<AtelierOverlayGradientConfig>>;
};

export function AtelierGradientControls({ gradients, onChange }: AtelierGradientControlsProps) {
  return (
    <div className="gradient-tool">
      <label>
        <span>Degrade haut</span>
        <input
          max={1.6}
          min={0}
          onChange={(event) =>
            onChange((current) => ({ ...current, topOpacity: Number(event.target.value) }))
          }
          step={0.05}
          type="range"
          value={gradients.topOpacity}
        />
        <output>{gradients.topOpacity.toFixed(2)}</output>
      </label>
      <label>
        <span>Degrade bas</span>
        <input
          max={1.6}
          min={0}
          onChange={(event) =>
            onChange((current) => ({ ...current, bottomOpacity: Number(event.target.value) }))
          }
          step={0.05}
          type="range"
          value={gradients.bottomOpacity}
        />
        <output>{gradients.bottomOpacity.toFixed(2)}</output>
      </label>
    </div>
  );
}
