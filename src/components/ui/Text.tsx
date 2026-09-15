import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, TextStyle } from 'react-native';
import { Colors, Typography } from '../../theme';

export interface TextProps extends RNTextProps {
    variant?:
    | 'display'
    | 'headline'
    | 'title'
    | 'body'
    | 'label'
    | 'displayLg'
    | 'displayMd'
    | 'displaySm'
    | 'headlineLg'
    | 'headlineMd'
    | 'headlineSm'
    | 'titleLg'
    | 'titleMd'
    | 'titleSm'
    | 'bodyLg'
    | 'bodyMd'
    | 'bodySm'
    | 'labelLg'
    | 'labelMd'
    | 'labelSm';
    color?: string;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
}

export const Text: React.FC<TextProps> = ({
    variant = 'bodyMd',
    color,
    align,
    bold,
    style,
    children,
    ...props
}) => {
    const getVariantStyle = (): TextStyle => {
        switch (variant) {
            case 'display': return Typography.displayMd;
            case 'headline': return Typography.headlineMd;
            case 'title': return Typography.titleLg;
            case 'body': return Typography.bodyMd;
            case 'label': return Typography.labelLg;
            default:
                return (Typography as any)[variant] || Typography.bodyMd;
        }
    };

    const textStyle: TextStyle = {
        ...getVariantStyle(),
        color: color || Colors.onSurface,
        textAlign: align,
        ...(bold ? { fontFamily: 'Lexend_700Bold' } : {}),
    };

    return (
        <RNText style={[textStyle, style]} {...props}>
            {children}
        </RNText>
    );
};
