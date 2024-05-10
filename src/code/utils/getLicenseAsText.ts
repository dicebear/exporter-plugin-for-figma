import type { Export } from '../types';

export function getLicenseAsText(exportData: Export): string {
  const licenseName = exportData.frame.settings.licenseName.trim();
  const licenseUrl = exportData.frame.settings.licenseUrl.trim();
  const licenseText = exportData.frame.settings.licenseText.trim();

  const creatorName = exportData.frame.settings.creator.trim();
  const creatorUrl = exportData.frame.settings.homepage.trim();

  const sourceName = exportData.frame.settings.sourceTitle.trim();
  const sourceUrl = exportData.frame.settings.source.trim();

  if (licenseText) {
    return licenseText;
  }

  let title = sourceName ? `„${sourceName}”` : 'Design';
  const creator = `„${creatorName || 'Unknown'}”`;

  if (sourceUrl) {
    title += ` (${sourceUrl})`;
  }

  let result = '';

  if (licenseName !== 'MIT' && !creatorUrl.includes('www.dicebear.com') && sourceName) {
    result += 'Remix of ';
  }

  result += `${title} by ${creator}`;

  if (licenseName) {
    result += `, licensed under „${licenseName}”`;

    if (licenseUrl) {
      result += ` (${licenseUrl})`;
    }
  }

  return result;
}
