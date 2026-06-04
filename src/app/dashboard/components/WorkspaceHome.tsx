import { Images, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

type Props = {
  brandName: string;
  onTrain: () => void;
  onGenerate: () => void;
  onAdvanced: () => void;
};

export function WorkspaceHome({ brandName, onTrain, onGenerate, onAdvanced }: Props) {
  return (
    <section className="workspace-home" aria-label="Choisir un workflow">
      <div className="home-copy">
        <h1>{brandName}</h1>
        <p>Choisissez un flux : entraîner un modèle, ou générer des images avec le style de cette ecole.</p>
      </div>
      <div className="home-actions">
        <button className="button primary large" onClick={onTrain} type="button">
          <Zap size={18} />
          Entraîner un modèle
        </button>
        <button className="button secondary large" onClick={onGenerate} type="button">
          <Sparkles size={18} />
          Générer des images
        </button>
        <Link className="button secondary large" href="/veille">
          <Images size={18} />
          Veille SMA
        </Link>
        <button className="button ghost large" onClick={onAdvanced} type="button">
          <Zap size={18} />
          Mode avancé
        </button>
      </div>
    </section>
  );
}
