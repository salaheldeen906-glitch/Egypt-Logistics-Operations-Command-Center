import type { Row } from './model';

export const defaultBoxChoice = '__default_box__';

/** Match an existing Box unit without changing any historical unit records. */
export function findBoxUnit(units: Row[]) {
    return units.find(unit => String(unit.code).trim().toUpperCase() === 'BOX')
        || units.find(unit => String(unit.name || '').split(/[\/|]/).some(name =>
            ['box', 'صندوق'].includes(name.trim().toLowerCase())));
}
