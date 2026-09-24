import win32com.client
import pythoncom
from docx import Document
from spellchecker import SpellChecker
import os
import sys
import time
import argparse
import json
import urllib.request
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

def get_active_word_doc():
    """
    Connects to the running Word application and returns the path
    of the currently active document.
    """
    try:
        # Connect to the Word Application via COM
        word = win32com.client.GetActiveObject("Word.Application")
        # Get the active document
        doc = word.ActiveDocument
        return doc.FullName
    except Exception as e:
        print(f"❌ Error: Could not find an active Word document. {e}")
        return None

def extract_text_from_docx(file_path):
    """
    Reads the .docx file and returns a list of paragraphs.
    """
    try:
        doc = Document(file_path)
        # Extract text from all paragraphs
        return [p.text for p in doc.paragraphs if p.text.strip() != ""]
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return []

def run_spell_check(paragraphs):
    """
    Analyzes text and returns a report of misspellings.
    """
    spell = SpellChecker()
    report = []

    for i, para in enumerate(paragraphs):
        # Split paragraph into words, removing basic punctuation
        words = para.split()
        # Clean words (remove commas, periods, etc.)
        cleaned_words = [w.strip(".,!?;:()\"'").lower() for w in words]

        # Find words that are misspelled
        misspelled = spell.unknown(cleaned_words)

        for word in misspelled:
            correction = spell.correction(word)
            candidates = spell.candidates(word)

            report.append({
                "word": word,
                "suggestion": correction if correction else "No suggestion",
                "alternatives": list(candidates)[:3] if candidates else [],
                "context": para,
                "para_index": i + 1
            })

    return report

def print_report(report, file_path):
    """
    Prints the findings in a clean, readable format and sends them to the avatar.
    """
    print("\n" + "="*60)
    print(f"📄 FILE: {file_path}")
    print("="*60)

    if not report:
        print("✅ No spelling errors found! Great job.")
        send_to_avatar("✅ No spelling errors found! Great job.")
        return

    print(f"🔍 Found {len(report)} potential errors:\n")

    # Send summary to avatar
    send_to_avatar(f"Found {len(report)} typos!")
    time.sleep(3)

    for item in report:
        # Send each error to avatar
        error_msg = f"Typo: '{item['word']}' -> {item['suggestion']}"
        send_to_avatar(error_msg)

        # Also print to console
        print(f"❌ Word: '{item['word']}'")
        print(f"   💡 Suggestion: {item['suggestion']}")
        if item['alternatives']:
            print(f"   👉 Alternatives: {', '.join(item['alternatives'])}")
        print(f"   📍 Context: \"...{item['context']}...\"")
        print("-" * 30)

        # Wait before sending the next one so the avatar has time to "speak"
        time.sleep(4)

def send_to_avatar(text):
    """
    Sends a message to the Electron avatar via a local HTTP POST request.
    """
    try:
        url = "http://127.0.0.1:5000/speak"
        data = json.dumps({"text": text}).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=1) as response:
            pass
    except Exception as e:
        print(f"⚠️ Could not send to avatar: {e}")

def perform_scan():
    """
    The core scanning logic: find active doc -> extract -> check -> report.
    """
    # Initialize COM for the current thread (required for watchdog background threads)
    pythoncom.CoInitialize()
    try:
        file_path = get_active_word_doc()
        if not file_path:
            return

        paragraphs = extract_text_from_docx(file_path)
        if not paragraphs:
            print("⚠️ Document appears to be empty.")
            return

        findings = run_spell_check(paragraphs)
        print_report(findings, file_path)
    finally:
        # Uninitialize COM to clean up
        pythoncom.CoUninitialize()

class DocSaveHandler(FileSystemEventHandler):
    """
    Watchdog handler that triggers a scan when the target file is modified.
    """
    def __init__(self, target_file):
        self.target_file = os.path.abspath(target_file)

    def on_modified(self, event):
        if os.path.abspath(event.src_path) == self.target_file:
            print("\n💾 Save detected! Scanning for typos...")
            perform_scan()

def start_watching():
    """
    Sets up the watchdog observer for the active Word document.
    """
    file_path = get_active_word_doc()
    if not file_path:
        print("❌ No active document found to watch.")
        return

    print(f"👀 Now watching: {file_path}")
    print("The script will automatically scan whenever you save the file.")
    print("Press Ctrl+C to stop.\n")

    event_handler = DocSaveHandler(file_path)
    observer = Observer()
    # We watch the directory because some apps do a 'save-to-temp-and-rename'
    observer.schedule(event_handler, os.path.dirname(file_path), recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

def main():
    parser = argparse.ArgumentParser(description="Word Document Spell Checker")
    parser.add_argument("--watch", action="store_true", help="Watch the active document and scan on save")
    args = parser.parse_args()

    if args.watch:
        start_watching()
    else:
        print("🚀 Word Spelling MVP started.")
        print("Instructions: Open a Word doc, then come back here and press ENTER to check it.")
        print("Type 'exit' to quit.\n")

        while True:
            user_input = input("👉 Press Enter to scan active document (or type 'exit'): ").strip().lower()

            if user_input == 'exit':
                break

            print("Scanning...")
            perform_scan()
            print("\nReady for next scan. Press Enter to check again.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped by user.")
        sys.exit(0)
