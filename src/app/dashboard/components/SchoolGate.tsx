import { ChevronRight, Plus } from "lucide-react";
import { LoadingImage } from "../../components/LoadingImage";
import type { OrganizationStyleMatch } from "../../types";

type Props = {
  organizationMatches: OrganizationStyleMatch[];
  onChoose: (brandId: string) => void;
  onAddBrand: () => void;
};

export function SchoolGate({ organizationMatches, onChoose, onAddBrand }: Props) {
  return (
    <section className="school-gate" aria-label="Choisir une ecole">
      <div className="school-gate-copy">
        <span>AdStylr</span>
        <h1>Choisissez votre ecole</h1>
        <p>Les logos, overlays et LoRA associes seront preselectionnes pour vos generations.</p>
      </div>
      <div className="school-grid">
        {organizationMatches.map(({ brand, style }) => (
          <button
            className="school-card"
            key={brand.id}
            onClick={() => onChoose(brand.id)}
            type="button"
          >
            <span className="school-logo">
              <LoadingImage alt="" className="h-full w-full object-contain" src={`/brand/${brand.id}/logo.png`} wrapperClassName="block" />
            </span>
            <span className="school-card-copy">
              <strong>{brand.name}</strong>
              <small>{style ? `${style.name} · ${style.triggerWord}` : "Overlay uniquement"}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
      <button className="button ghost" onClick={onAddBrand} type="button">
        <Plus size={16} />
        Ajouter une ecole
      </button>
    </section>
  );
}
