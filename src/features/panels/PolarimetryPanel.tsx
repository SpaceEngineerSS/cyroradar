import { useApp } from '../../store/app';
import { colormapCss } from '../../core/colormaps/colormaps';
import { Button, EmptyState, Note, Progress, Readout, Section, Segmented } from '../../ui/controls';

export default function PolarimetryPanel() {
  const ds = useApp(s => s.dataset);
  const polsar = useApp(s => s.polsar);
  const status = useApp(s => s.polsarStatus);
  const overlay = useApp(s => s.overlays.polsar);
  const run = useApp(s => s.runPolsar);
  const setOverlay = useApp(s => s.setOverlay);

  if (!ds) return <EmptyState icon="polarimetry" title="No radargram">Load a scene first.</EmptyState>;

  return (
    <>
      <Section title="What this is" collapsible={false}>
        <Note tone="warn">SHARAD and MARSIS each use one polarisation, so their data cannot be decomposed. This panel simulates what a fully polarimetric sounder might see over the same scene.</Note>
        <p className="text-xs text-dim">
          Sharp interfaces are modelled as surface scattering, the diffuse energy between them as volume scattering from dust and inclusions, plus a small dihedral part. The standard Pauli and Cloude–Pottier decompositions are then applied, with the coherency matrix taken as diagonal.
        </p>
        {status === 'running' ? (
          <Progress value={null} label="Simulating" />
        ) : (
          <Button tone="primary" icon="polarimetry" onClick={run}>
            {polsar ? 'Simulate again' : 'Simulate and decompose'}
          </Button>
        )}
      </Section>

      {polsar && (
        <>
          <Section title="Show on the radargram" collapsible={false}>
            <Segmented
              label="Polarimetry overlay"
              value={overlay}
              onChange={v => setOverlay('polsar', v)}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'entropy', label: 'Entropy H' },
                { value: 'alpha', label: 'Alpha ᾱ' },
              ]}
            />
            {overlay !== 'off' && (
              <div className="flex flex-col gap-1">
                <div className="h-2.5" style={{ background: colormapCss(overlay === 'entropy' ? 'viridis' : 'diverging') }} />
                <div className="num flex justify-between text-2xs text-faint">
                  <span>{overlay === 'entropy' ? '0, one mechanism' : '0°, surface'}</span>
                  <span>{overlay === 'entropy' ? '1, random' : '90°, dihedral'}</span>
                </div>
              </div>
            )}
          </Section>
          <Section title="Averages" collapsible={false}>
            <div className="grid grid-cols-3 gap-3">
              <Readout label="Entropy" value={polsar.stats.meanEntropy.toFixed(2)} />
              <Readout label="Alpha" value={polsar.stats.meanAlphaDeg.toFixed(1)} unit="°" />
              <Readout label="Anisotropy" value={polsar.stats.meanAnisotropy.toFixed(2)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="label">Pauli power shares</span>
              <div className="flex h-3 w-full overflow-hidden">
                <span style={{ width: `${polsar.stats.fractions.surface * 100}%`, background: 'var(--c-ice)' }} title="Surface" />
                <span style={{ width: `${polsar.stats.fractions.volume * 100}%`, background: 'var(--c-clay)' }} title="Volume" />
                <span style={{ width: `${polsar.stats.fractions.dihedral * 100}%`, background: 'var(--c-accent)' }} title="Dihedral" />
              </div>
              <div className="num flex justify-between text-2xs text-dim">
                <span>surface {(polsar.stats.fractions.surface * 100).toFixed(0)}%</span>
                <span>volume {(polsar.stats.fractions.volume * 100).toFixed(0)}%</span>
                <span>dihedral {(polsar.stats.fractions.dihedral * 100).toFixed(0)}%</span>
              </div>
            </div>
            <p className="text-2xs text-faint">
              Grid {polsar.width} × {polsar.height}
              {polsar.stepX > 1 ? `, every ${polsar.stepX}th trace and sample` : ''}.
            </p>
          </Section>
        </>
      )}
    </>
  );
}
