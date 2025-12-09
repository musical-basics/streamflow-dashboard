import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    // Simulate a 1.5-second upload delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Get the filename from the form data if provided
    let filename = 'mock_video_1.mp4';
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (file) {
            filename = file.name;
        }
    } catch {
        // If no form data, use default filename
    }

    // Return a fake success response
    return NextResponse.json({
        id: `video_${Date.now()}`,
        filename,
        duration: '10:00',
        title: filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        thumbnail: '',
    });
}
