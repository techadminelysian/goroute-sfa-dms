package com.goroute.sfa.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

// =========================================================================
// Haute-Minimalist Executive Design System — Material 3 Theme & Shapes
// Project: GoRoute SFA / DMS
// =========================================================================

// Material 3 ColorScheme Configuration
val HauteMinimalistColorScheme = lightColorScheme(
    primary = RoyalBlueAction,                  // 0xFF1E40AF
    onPrimary = PremiumSurface,                // 0xFFFFFFFF
    primaryContainer = RoyalBlueLight,          // 0xFFEFF6FF
    onPrimaryContainer = RoyalBlueAction,      // 0xFF1E40AF
    secondary = SlateMutedSecondary,            // 0xFF64748B
    onSecondary = PremiumSurface,              // 0xFFFFFFFF
    background = PremiumCanvas,                // 0xFFF8FAFC
    onBackground = SlateInkPrimary,            // 0xFF0F172A
    surface = PremiumSurface,                  // 0xFFFFFFFF
    onSurface = SlateInkPrimary,               // 0xFF0F172A
    surfaceVariant = PremiumCanvas,            // 0xFFF8FAFC
    onSurfaceVariant = SlateMutedSecondary,    // 0xFF64748B
    outline = StructuralBorder,                // 0xFFE2E8F0
    outlineVariant = StructuralBorderStrong,   // 0xFFCBD5E1
    error = CrimsonAlert,                      // 0xFFBE123C
    onError = PremiumSurface,                  // 0xFFFFFFFF
    errorContainer = CrimsonLight,             // 0xFFFFF1F2
    onErrorContainer = CrimsonAlert            // 0xFFBE123C
)

// Corner Radius Scale
val HauteMinimalistShapes = Shapes(
    small = RoundedCornerShape(6.dp),        // chips, stepper buttons, compact badges
    medium = RoundedCornerShape(8.dp),       // cards, standard buttons, text fields
    large = RoundedCornerShape(12.dp),       // content cards, dialogs
    extraLarge = RoundedCornerShape(16.dp)   // bottom sheets, hero containers
)

@Composable
fun GoRouteTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = HauteMinimalistColorScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            if (window != null) {
                // Editorial matte white status & navigation bars with dark ink icons
                window.statusBarColor = PremiumSurface.toArgb()
                window.navigationBarColor = PremiumSurface.toArgb()
                val controller = WindowCompat.getInsetsController(window, view)
                controller.isAppearanceLightStatusBars = true
                controller.isAppearanceLightNavigationBars = true
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        shapes = HauteMinimalistShapes,
        typography = Typography,
        content = content
    )
}
