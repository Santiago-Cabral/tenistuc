import type { ReactNode } from 'react';
import { Text } from 'react-native';

export default function WebTabLabel({ color, children }: { color: string; children: ReactNode }) {
    return (
        <Text
            numberOfLines={2}
            style={{ color, fontSize: 9, lineHeight: 11, textAlign: 'center', width: '100%' }}
        >
            {children}
        </Text>
    );
}
