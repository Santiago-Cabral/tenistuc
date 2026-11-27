export interface Venue {
    name: string;
    address?: string;
}

export interface VenueGroup {
    city: string;
    venues: Venue[];
}

export const CUSTOM_VENUE = 'Otro';

export const VENUE_GROUPS: VenueGroup[] = [
    {
        city: 'San Miguel de Tucumán',
        venues: [
            { name: 'Tucumán Lawn Tennis Club', address: 'Av. Gobernador del Campo 400' },
            { name: 'Complejo Ojo de Agua (Atlético Tucumán)', address: 'RP301, T4000 San Miguel de Tucumán, Tucumán' },
            { name: 'Academia de Tenis LTRC', address: 'Av. Brígido Terán 636' },
            { name: 'Facultad de Educación Física (FACDEF)', address: 'Av. Benjamín Aráoz 751' },
            { name: 'Club Atlético San Martín, Complejo Natalio Mirkin', address: 'Camino del Perú 900' },
        ],
    },
    {
        city: 'Yerba Buena',
        venues: [
            { name: 'Jockey Club Tenis', address: 'Av. Perón y Bascary' },
            { name: 'El Bosque Tenis Club', address: 'Lamadrid 751' },
            { name: 'Unidad Sionista Tucumán', address: 'Av. Aconquija 946' },
            { name: 'Aiziczon Tennis Academy', address: 'Av. Juan Domingo Perón 1000, esquina Las Rosas' },
            { name: 'Las Lomitas Tennis', address: '3194 C. Jorge Luis Borges, Yerba Buena, Tucumán' },
            { name: 'Tucumán Rugby Club', address: 'Salas y Valdez 1500, T4107 Yerba Buena, Tucumán' },
        ],
    },
    {
        city: 'Tafí Viejo',
        venues: [
            { name: 'Club Atlético Talleres de Tafí Viejo', address: 'Av. Sáenz Peña' },
            { name: 'AJC Tafí Viejo', address: 'Avenida Leandro N. Alem 701, T4103 Tafí Viejo, Tucumán' },
        ],
    },
    {
        city: 'Concepción',
        venues: [
            { name: 'Concepción Lawn Tennis Club', address: 'Av Libertador General San Martín, T4146 Concepción, Tucumán' },
        ],
    },
    {
        city: 'Famaillá',
        venues: [
            { name: 'El Refugio Club Privado', address: 'Obispo Colombres, T4132 Famaillá, Tucumán' },
        ],
    },
    {
        city: 'Juan Bautista Alberdi',
        venues: [{ name: 'Alberdi Tenis Club', address: 'A Heredia, T4158 Juan Bautista Alberdi, Tucumán' }],
    },
    {
        city: 'Monteros',
        venues: [
            { name: 'Monteros Voley', address: 'RP325, Monteros, Tucumán' },
            { name: 'Complejo Municipal de Monteros', address: 'Leandro Aráoz, T4142 Monteros, Tucumán' },
        ],
    },
];

export const VENUES: string[] = VENUE_GROUPS.flatMap(group => group.venues.map(venue => venue.name));

const LEGACY_VENUES: Record<string, string> = {
    'lawn tenis club': 'Tucumán Lawn Tennis Club',
    'tucuman lawn tennis': 'Tucumán Lawn Tennis Club',
    'club atletico san martin': 'Club Atlético San Martín, Complejo Natalio Mirkin',
};

const ACCENTS: Record<string, string> = {
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u',
    ä: 'a', ë: 'e', ï: 'i', ö: 'o', ü: 'u', ñ: 'n',
};

const normalizeText = (value: string) => value
    .toLowerCase()
    .replace(/[áéíóúäëïöüñ]/g, char => ACCENTS[char])
    .trim();

export function normalizeVenue(value: string | null | undefined): string | null {
    if (!value) return null;
    const key = normalizeText(value);
    if (key === normalizeText(CUSTOM_VENUE)) return null;
    if (LEGACY_VENUES[key]) return LEGACY_VENUES[key];
    return VENUES.find(venue => normalizeText(venue) === key) ?? null;
}
