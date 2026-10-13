/* PDF report for the current radargram: what was looked at, how, and what was
 * found, with the plot as Figure 1. Uses jsPDF's built-in Helvetica, so text
 * is kept to Latin-1 (ε and µ are spelled out). Loaded on demand. */

import { jsPDF } from 'jspdf';
import { useApp } from '../../store/app';
import { renderPlotImage } from './capture';
import { CLASS_LABELS } from '../analysis/anomaly-detector';
import { segmentLetter } from '../../features/radargram/overlay';

const M = 18;
const PAGE_W = 210;
const PAGE_H = 297;
const TEXT_W = PAGE_W - 2 * M;

/** jsPDF's standard fonts cover WinAnsi only. */
const latin = (s: string) =>
  s
    .replace(/ε/g, 'eps')
    .replace(/µ/g, 'u')
    .replace(/δ/g, 'd')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/±/g, '+/-')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '');

export function generateReport(): void {
  const s = useApp.getState();
  const ds = s.dataset;
  if (!ds) throw new Error('Open a radargram before making a report.');
  const m = ds.metadata;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = M;
  let section = 0;

  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text(latin(`CryoRadar ${__APP_VERSION__} - ${m.title}`), M, PAGE_H - 10);
      doc.text(`${p} / ${pages}`, PAGE_W - M, PAGE_H - 10, { align: 'right' });
    }
  };
  const need = (h: number) => {
    if (y + h > PAGE_H - 18) {
      doc.addPage();
      y = M;
    }
  };
  const heading = (t: string) => {
    need(14);
    section++;
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(25);
    doc.text(latin(`${section}  ${t}`), M, y);
    y += 2.5;
    doc.setDrawColor(200);
    doc.line(M, y, PAGE_W - M, y);
    y += 5;
  };
  const para = (t: string, size = 9, color = 50) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(latin(t), TEXT_W) as string[];
    need(lines.length * size * 0.42 + 2);
    doc.text(lines, M, y);
    y += lines.length * size * 0.42 + 2;
  };
  const table = (head: string[], rows: string[][], widths: number[]) => {
    doc.setFontSize(8);
    need(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60);
    let x = M;
    head.forEach((h, i) => {
      doc.text(latin(h), x, y);
      x += widths[i];
    });
    y += 1.5;
    doc.setDrawColor(210);
    doc.line(M, y, PAGE_W - M, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40);
    for (const r of rows) {
      need(5);
      x = M;
      r.forEach((c, i) => {
        doc.text(latin(c), x, y);
        x += widths[i];
      });
      y += 4.4;
    }
    y += 2;
  };

  /* Title */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text(latin(m.title), M, y + 4);
  y += 11;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(latin(`Subsurface radar report - generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`), M, y);
  y += 8;

  heading('Data');
  table(
    ['Instrument', 'Source', 'Orbit', 'Date', 'Grid', 'Sampling'],
    [[
      `${m.instrument} ${(m.frequencyHz / 1e6).toFixed(0)} MHz`,
      m.source === 'synthetic' ? 'Simulated' : m.source === 'pds' ? 'NASA PDS' : 'Local file',
      m.orbitNumber ? String(m.orbitNumber) : '-',
      m.acquisitionDate || '-',
      `${ds.radargram.width} x ${ds.radargram.height}`,
      `${(ds.radargram.sampleInterval * 1e9).toFixed(1)} ns, ${ds.radargram.traceSpacingM} m`,
    ]],
    [30, 26, 18, 24, 30, 46],
  );
  para(m.description);

  /* Figure */
  try {
    const img = renderPlotImage(1.5);
    const h = Math.min(110, (TEXT_W * img.height) / img.width);
    need(h + 10);
    doc.addImage(img.toDataURL('image/png'), 'PNG', M, y, TEXT_W, h);
    y += h + 4;
    para(`Figure 1. ${s.mainView === 'radargram' ? 'Radargram' : 'Current view'} as displayed, colour table ${s.colormap}${s.statics ? ', static correction applied' : ''}${s.variant === 'migrated' && s.migration.result ? ', migrated' : ''}.`, 8, 100);
  } catch {
    /* no plot on screen; the report is still useful without it */
  }

  heading('Method');
  const det = s.detection;
  para(
    `Bright basal reflections were sought trace by trace: the strongest echo deeper than ${det.minDepthM} m below the surface was compared with the surface echo, the surface Fresnel reflection and two-way transmission were undone for an overburden of eps ${det.hostPermittivity} and loss tangent ${det.hostLossTangent}, and the two-way dielectric loss to that depth was added back. Echoes whose implied basal reflectivity exceeded ${det.thresholdDb} dB and stood at least 10 dB above the noise floor were kept and inverted for the permittivity below the interface (Orosei et al. 2018).`,
  );
  if (m.calibration === 'display') para('Caution: the radargram is an 8-bit browse image with a 35 dB greyscale range. Strong ratios are clipped, so reflectivities and permittivities are lower bounds.', 9, 140);

  heading('Detections');
  if (s.segments.length === 0) para('No segments were detected with these settings.');
  else
    table(
      ['Seg', 'Traces', 'Depth m', 'Base eps', 'R dB', 'Class', 'P water', 'P clay', 'P clutter'],
      s.segments.map((seg, i) => {
        const a = s.anomalies[seg.representative];
        return [
          segmentLetter(i),
          `${seg.traceStart}-${seg.traceEnd}`,
          seg.meanDepthM.toFixed(0),
          seg.meanPermittivity.toFixed(1),
          seg.peakReflectivityDb.toFixed(1),
          CLASS_LABELS[seg.classification],
          (a.hypothesis.pLiquidWater * 100).toFixed(0) + '%',
          (a.hypothesis.pSmectiteClay * 100).toFixed(0) + '%',
          (a.hypothesis.pClutter * 100).toFixed(0) + '%',
        ];
      }),
      [10, 22, 16, 16, 13, 42, 16, 14, 14],
    );

  if (s.uq.results.length) {
    heading('Uncertainty');
    para(`Monte Carlo propagation with ${s.uq.results[0].nSamples} samples per segment (overburden eps sigma ${s.uq.settings.permittivitySigma}, power sigma ${s.uq.settings.powerSigmaDb} dB, loss tangent log-normal, timing half a sample).`);
    table(
      ['Seg', 'Depth (mean +/- sd)', '90% depth', '90% base eps', 'P(eps >= 25)'],
      s.uq.results.map(r => [
        segmentLetter(r.anomalyIndex),
        `${r.meanDepthM.toFixed(0)} +/- ${r.stdDevM.toFixed(0)} m`,
        `${r.percentile5.toFixed(0)}-${r.percentile95.toFixed(0)} m`,
        `${r.basalPermittivity5.toFixed(1)}-${r.basalPermittivity95.toFixed(1)}`,
        `${(r.pWet * 100).toFixed(0)}%`,
      ]),
      [12, 44, 34, 34, 30],
    );
  }

  if (s.fwi.result) {
    const r = s.fwi.result;
    heading('Waveform inversion (experimental)');
    para(
      `Envelope inversion of traces ${r.roi.traceStart}-${r.roi.traceEnd}, samples ${r.roi.sampleStart}-${r.roi.sampleEnd} on a ${r.nx} x ${r.nz} grid (${r.backend}). ${r.iterations} iterations reduced the misfit from ${r.misfitHistory[0].toFixed(3)} to ${r.misfitHistory[r.misfitHistory.length - 1].toFixed(3)}. Recovered permittivity ranges from ${Math.min(...r.permittivity).toFixed(1)} to ${Math.max(...r.permittivity).toFixed(1)}. Exploding-reflector, 2-D scalar approximation; see the CryoRadar documentation for its limits.`,
    );
  }

  if (m.references.length) {
    heading('References');
    for (const ref of m.references) para(`${ref.authors} (${ref.year}). ${ref.title}. ${ref.journal}.${ref.doi ? ` doi:${ref.doi}` : ''}`, 8.5);
    para('Orosei, R. et al. (2018). Radar evidence of subglacial liquid water on Mars. Science 361, 490-493. doi:10.1126/science.aar7268', 8.5);
  }

  footer();
  doc.save(`${m.productId.toLowerCase()}-report.pdf`);
}
