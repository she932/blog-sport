// ------------------------------------------------------------------
//  Slugification partagée (tags, etc.).
//  Retire les accents, met en minuscules et remplace tout caractère
//  non alphanumérique par un tiret. Déterministe et sans dépendance.
// ------------------------------------------------------------------

/** Transforme un tag libre en slug d'URL stable. Ex. « Étirements musculation » -> « etirements-musculation ». */
export function slugifyTag(tag: string): string {
  return tag
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
