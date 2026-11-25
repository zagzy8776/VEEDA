package com.veda.mobile.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Thermostat
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material.icons.filled.Waves
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Color Palette matching VEEDA Dark Theme
val VeedaBg = Color(0xFF0A0E1A)
val VeedaCardBg = Color(0xFF131C2E)
val VeedaCardBorder = Color(0x28FFFFFF)
val VeedaTeal = Color(0xFF2DD4A4)
val VeedaBlue = Color(0xFF378ADD)
val VeedaAmber = Color(0xFFEF9F27)
val VeedaRed = Color(0xFFE24B4A)
val VeedaText = Color(0xFFE2F4F0)
val VeedaMuted = Color(0xFF7A9E96)

@Composable
fun VeedaApp() {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = VeedaBg
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header
            HeaderSection()

            // Guardian Ring Score
            GuardianScoreCard(score = 85)

            // Vitals Grid
            VitalsGrid()

            // Guardian Mode Status
            GuardianStatusCard()

            // Quick Actions
            ActionButtons()
        }
    }
}

@Composable
fun HeaderSection() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = "VEEDA",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = VeedaTeal,
                letterSpacing = 2.sp
            )
            Text(
                text = "Wellness Intelligence",
                fontSize = 12.sp,
                color = VeedaMuted
            )
        }
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .background(VeedaCardBg)
                .border(1.dp, VeedaTeal, CircleShape)
                .padding(horizontal = 12.dp, vertical = 6.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(VeedaTeal)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "ONLINE",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = VeedaTeal
                )
            }
        }
    }
}

@Composable
fun GuardianScoreCard(score: Int) {
    var progress by remember { mutableStateOf(0f) }
    val animatedProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = tween(durationMillis = 1200),
        label = "ringAnimation"
    )

    LaunchedEffect(Unit) {
        progress = score / 100f
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, VeedaCardBorder, RoundedCornerShape(20.dp)),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = VeedaCardBg)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(140.dp)
            ) {
                Canvas(modifier = Modifier.size(130.dp)) {
                    val strokeWidth = 22f
                    // Background Ring
                    drawCircle(
                        color = Color(0x182DD4A4),
                        style = Stroke(width = strokeWidth)
                    )
                    // Progress Arc
                    drawArc(
                        color = VeedaTeal,
                        startAngle = -90f,
                        sweepAngle = 360f * animatedProgress,
                        useCenter = false,
                        style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "$score",
                        fontSize = 38.sp,
                        fontWeight = FontWeight.Bold,
                        color = VeedaText,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "WELLNESS",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        color = VeedaMuted,
                        letterSpacing = 1.sp
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Optimal Vitals Range",
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = VeedaTeal
            )
        }
    }
}

@Composable
fun VitalsGrid() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = "LIVE VITALS",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = VeedaMuted,
            letterSpacing = 1.sp
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            VitalTile(
                modifier = Modifier.weight(1f),
                title = "Heart Rate",
                value = "72",
                unit = "bpm",
                icon = Icons.Default.Favorite,
                accentColor = VeedaRed
            )
            VitalTile(
                modifier = Modifier.weight(1f),
                title = "Breathing",
                value = "16",
                unit = "br/min",
                icon = Icons.Default.Waves,
                accentColor = VeedaBlue
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            VitalTile(
                modifier = Modifier.weight(1f),
                title = "Hydration",
                value = "65",
                unit = "%",
                icon = Icons.Default.WaterDrop,
                accentColor = VeedaBlue
            )
            VitalTile(
                modifier = Modifier.weight(1f),
                title = "Temperature",
                value = "36.6",
                unit = "°C",
                icon = Icons.Default.Thermostat,
                accentColor = VeedaTeal
            )
        }
    }
}

@Composable
fun VitalTile(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    unit: String,
    icon: ImageVector,
    accentColor: Color
) {
    Card(
        modifier = modifier.border(1.dp, VeedaCardBorder, RoundedCornerShape(16.dp)),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = VeedaCardBg)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = title, fontSize = 12.sp, color = VeedaMuted)
                Icon(
                    imageVector = icon,
                    contentDescription = title,
                    tint = accentColor,
                    modifier = Modifier.size(18.dp)
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = value,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = VeedaText,
                    fontFamily = FontFamily.Monospace
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = unit,
                    fontSize = 11.sp,
                    color = VeedaMuted,
                    modifier = Modifier.padding(bottom = 3.dp)
                )
            }
        }
    }
}

@Composable
fun GuardianStatusCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0x382DD4A4), RoundedCornerShape(16.dp)),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0x1A2DD4A4))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Shield,
                contentDescription = "Guardian Mode",
                tint = VeedaTeal,
                modifier = Modifier.size(28.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = "Guardian Mode Active",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = VeedaText
                )
                Text(
                    text = "Fall detection & distress audio watch enabled in background",
                    fontSize = 11.sp,
                    color = VeedaMuted
                )
            }
        }
    }
}

@Composable
fun ActionButtons() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(
            onClick = { /* Launch rPPG camera measurement */ },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = VeedaTeal)
        ) {
            Icon(
                imageVector = Icons.Default.Favorite,
                contentDescription = null,
                tint = VeedaBg,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Measure Vitals (rPPG Camera)",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = VeedaBg
            )
        }

        Button(
            onClick = { /* Open local emergency SOS helper */ },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = VeedaRed)
        ) {
            Icon(
                imageVector = Icons.Default.LocalHospital,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Emergency SOS Care",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }
    }
}

@Preview(showBackground = true, name = "VEEDA Native Dashboard Preview")
@Composable
fun VeedaAppPreview() {
    VeedaApp()
}
