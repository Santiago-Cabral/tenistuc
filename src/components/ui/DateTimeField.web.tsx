import React from 'react';
import { Colors, Radius, Typography } from '../../theme';

export type DateTimePickerEvent = {
    type: 'set' | 'dismissed';
    nativeEvent: { timestamp: number };
};

interface Props {
    value: Date;
    onChange: (event: DateTimePickerEvent, date?: Date) => void;
    mode?: 'date' | 'time' | 'datetime' | 'countdown';
    minimumDate?: Date;
    maximumDate?: Date;
    display?: string;
    locale?: string;
    is24Hour?: boolean;
    style?: any;
}

const pad = (value: number) => String(value).padStart(2, '0');

const toDateValue = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const toTimeValue = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const toDateTimeValue = (date: Date) => `${toDateValue(date)}T${toTimeValue(date)}`;

export default function DateTimeField({
    value,
    onChange,
    mode = 'date',
    minimumDate,
    maximumDate,
    style,
}: Props) {
    const inputType = mode === 'time' ? 'time' : mode === 'datetime' ? 'datetime-local' : 'date';
    const current = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();

    const formatted = inputType === 'time'
        ? toTimeValue(current)
        : inputType === 'datetime-local'
            ? toDateTimeValue(current)
            : toDateValue(current);

    const handleChange = (event: any) => {
        const raw = String(event.target?.value ?? '');
        if (!raw) return;

        let next: Date;
        if (inputType === 'time') {
            const [hours, minutes] = raw.split(':').map(Number);
            next = new Date(current);
            next.setHours(hours, minutes, 0, 0);
        } else if (inputType === 'datetime-local') {
            next = new Date(raw);
        } else {
            const [year, month, day] = raw.split('-').map(Number);
            next = new Date(year, month - 1, day, current.getHours(), current.getMinutes(), 0, 0);
        }

        if (Number.isNaN(next.getTime())) return;
        onChange({ type: 'set', nativeEvent: { timestamp: next.getTime() } }, next);
    };

    return React.createElement('input', {
        type: inputType,
        value: formatted,
        min: inputType === 'date' && minimumDate ? toDateValue(minimumDate) : undefined,
        max: inputType === 'date' && maximumDate ? toDateValue(maximumDate) : undefined,
        onChange: handleChange,
        style: {
            backgroundColor: Colors.surfaceContainer,
            borderColor: Colors.outlineVariant,
            borderRadius: Radius.lg,
            borderStyle: 'solid',
            borderWidth: 1,
            color: Colors.onSurface,
            fontFamily: Typography.bodyMd.fontFamily,
            fontSize: 16,
            minHeight: 44,
            paddingBottom: 10,
            paddingLeft: 12,
            paddingRight: 12,
            paddingTop: 10,
            width: '100%',
            ...(style ?? {}),
        },
    });
}
