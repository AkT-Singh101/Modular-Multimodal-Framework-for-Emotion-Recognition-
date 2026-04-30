import sys
import json
import cv2
import warnings
from collections import Counter
from transformers import pipeline
warnings.filterwarnings("ignore")

def analyze_visual(video_path):
    try:
        from deepface import DeepFace
    except ImportError:
        return {"emotion": "error", "confidence": 0.0}

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps != fps: # Check for 0 or NaN
        fps = 30
        
    frame_interval = int(max(round(fps), 1))
    
    emotions = []
    confidences = []
    
    frame_count = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        if frame_count % frame_interval == 0:
            try:
                # Need to resize frame if it's too large to speed up DeepFace, but standard is fine
                result = DeepFace.analyze(frame, actions=['emotion'], enforce_detection=False, silent=True)
                res = result[0] if isinstance(result, list) else result
                
                dominant = res.get('dominant_emotion')
                if dominant:
                    emotions.append(dominant)
                    confidences.append(res['emotion'][dominant])
            except Exception:
                pass
                
        frame_count += 1
        
    cap.release()
    
    if not emotions:
        return {"emotion": "neutral", "confidence": 0.0}
        
    most_common = Counter(emotions).most_common(1)[0][0]
    relevant_confs = [c for e, c in zip(emotions, confidences) if e == most_common]
    avg_conf = (sum(relevant_confs) / len(relevant_confs)) / 100.0 # DeepFace conf is 0-100
    
    return {"emotion": str(most_common), "confidence": round(float(avg_conf), 2)}

def analyze_audio(video_path):
    import tempfile
    import os
    try:
        from moviepy import VideoFileClip
        clip = VideoFileClip(video_path)
        if clip.audio is None:
            return {"emotion": "neutral", "confidence": 0.0}
            
        fd, temp_audio = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        
        # Extract audio snippet (first 30s to save time)
        subclip = clip.subclip(0, min(clip.duration, 30)) if hasattr(clip, 'duration') and clip.duration else clip
        subclip.audio.write_audiofile(temp_audio, logger=None, verbose=False)
        clip.close()
        
        er_pipeline = pipeline("audio-classification", model="superb/wav2vec2-base-superb-er")
        results = er_pipeline(temp_audio)
        
        # Some audio models throw lists, others single list
        if isinstance(results, list) and isinstance(results[0], list):
            results = results[0]
            
        best_pred = max(results, key=lambda x: x['score'])
        
        # map typical superb labels (neu, hap, ang, sad...)
        label_map = {
            "neu": "neutral",
            "hap": "happy",
            "ang": "angry", 
            "sad": "sad",
            "exc": "excited"
        }
        emotion = label_map.get(best_pred['label'].lower(), best_pred['label'])
        
        try: os.remove(temp_audio) 
        except: pass
        
        return {"emotion": emotion, "confidence": round(float(best_pred['score']), 2)}
    except Exception as e:
        return {"emotion": "neutral", "confidence": 0.0, "error": str(e)}

if __name__ == "__main__":
    import traceback
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Video path required"}))
            sys.exit(1)
            
        video_path = sys.argv[1]
        
        # We write all processing logs to stderr so stdout is purely JSON.
        sys.stdout = sys.stderr
        
        v_res = analyze_visual(video_path)
        a_res = analyze_audio(video_path)
        
        output = {
            "video_emotion": v_res['emotion'],
            "video_confidence": v_res['confidence'],
            "audio_emotion": a_res['emotion'],
            "audio_confidence": a_res['confidence']
        }
        
        # Restore stdout and print result
        sys.stdout = sys.__stdout__
        print(json.dumps(output))
    except Exception as e:
        sys.stdout = sys.__stdout__
        print(json.dumps({"error": "Python Core Crash", "trace": traceback.format_exc()}))
        sys.exit(0)
