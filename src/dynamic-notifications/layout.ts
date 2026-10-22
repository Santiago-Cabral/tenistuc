import {
    CANVAS_PADDING,
    CARD_GAP,
    CARD_HEIGHT,
    CARD_MARGIN,
    CARD_MAX_WIDTH,
    DROP_GROW_POWER,
    DROP_GROW_SPAN,
    DROP_SIZE,
    DROP_STRETCH,
    EDGE_MARGIN,
    ISLAND_HEIGHT,
    ISLAND_MIN_TOP,
    ISLAND_TOP,
    ISLAND_WIDTH,
    NECK_BREAK,
    NECK_FALL,
    NECK_RISE,
    NECK_WIDTH,
} from './constants';
import { clamp, easeOutPower, mix, neckProfile } from './logic';
import type { IBuildNotificationGeometry, INotificationGeometry, INotificationLayout } from './types';

export interface IGetNotificationLayout {
    width: number;
    insetTop: number;
    islandWidth?: number;
    islandHeight?: number;
    islandTop?: number;
    cardWidth?: number;
    cardHeight?: number;
    cardRadius?: number;
    gap?: number;
}

/**
 * Calcula el layout del overlay a partir del ancho de la pantalla y del
 * inset superior (status bar / notch).
 */
export function getNotificationLayout({
    width,
    insetTop,
    islandWidth,
    islandHeight,
    islandTop,
    cardWidth,
    cardHeight,
    cardRadius,
    gap,
}: IGetNotificationLayout): INotificationLayout {
    const pillWidth = islandWidth ?? ISLAND_WIDTH;
    const pillHeight = islandHeight ?? ISLAND_HEIGHT;
    const pillTop = islandTop ?? Math.max(insetTop - pillHeight - ISLAND_TOP, ISLAND_MIN_TOP);
    const pillBottom = pillTop + pillHeight;

    const bodyWidth = cardWidth ?? Math.min(width - CARD_MARGIN * 2, CARD_MAX_WIDTH);
    const bodyHeight = cardHeight ?? CARD_HEIGHT;
    const bodyTop = pillBottom + (gap ?? CARD_GAP);

    return {
        width,
        centerX: width / 2,
        islandWidth: pillWidth,
        islandHeight: pillHeight,
        islandTop: pillTop,
        islandBottom: pillBottom,
        islandCenterY: pillTop + pillHeight / 2,
        islandRadius: pillHeight / 2,
        cardWidth: bodyWidth,
        cardHeight: bodyHeight,
        cardRadius: cardRadius ?? bodyHeight / 2,
        cardTop: bodyTop,
        cardLeft: (width - bodyWidth) / 2,
        cardCenterY: bodyTop + bodyHeight / 2,
        dropSize: DROP_SIZE,
        neckWidth: NECK_WIDTH,
        canvasHeight: bodyTop + bodyHeight + CANVAS_PADDING,
    };
}

/**
 * Posición y tamaño de cada figura (isla, cuello, gota) en función del
 * progreso de la animación. Corre en el UI thread.
 */
export function buildNotificationGeometry<T extends IBuildNotificationGeometry>({
    drop,
    expand,
    layout,
}: T): INotificationGeometry {
    'worklet';
    const grow = easeOutPower(clamp(drop / DROP_GROW_SPAN, 0, 1), DROP_GROW_POWER);
    const neck = neckProfile(drop / NECK_BREAK, NECK_RISE, NECK_FALL);

    const stretch = 1 + DROP_STRETCH * neck;
    const droplet = layout.dropSize * grow;

    const width = Math.min(
        mix(expand, droplet / stretch, layout.cardWidth),
        layout.width - EDGE_MARGIN * 2,
    );
    const height = mix(expand, droplet * stretch, layout.cardHeight);
    const radius = Math.min(
        mix(expand, droplet * 0.5, layout.cardRadius),
        Math.min(width, height) / 2,
    );

    const originY = layout.islandBottom - layout.islandHeight * 0.34;
    const centerY = mix(drop, originY, layout.cardCenterY);

    const neckWidth = Math.min(layout.neckWidth, width) * neck;
    const neckY = layout.islandBottom - layout.islandHeight * 0.5;

    return {
        x: layout.centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
        radius,
        neckX: layout.centerX - neckWidth / 2,
        neckY,
        neckWidth,
        neckHeight: Math.max(centerY - neckY, 0),
        neckRadius: neckWidth / 2,
        shadowOpacity: clamp(expand, 0, 1),
        offsetY: centerY - layout.cardCenterY,
        widthRatio: layout.cardWidth > 0 ? width / layout.cardWidth : 0,
    };
}
