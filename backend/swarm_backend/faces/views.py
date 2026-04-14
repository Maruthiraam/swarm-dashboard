from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.utils import timezone
from .models import RegisteredFace, RobotCommand
import math, base64
from django.core.files.base import ContentFile

@api_view(['POST'])
def register_face(request):
    name       = request.data.get('name', 'Unknown')
    descriptor = request.data.get('descriptor')
    photo_b64  = request.data.get('photo')

    face = RegisteredFace(name=name, descriptor=descriptor)
    if photo_b64:
        img_data = base64.b64decode(photo_b64.split(',')[1])
        face.photo.save(f'{name}.jpg', ContentFile(img_data), save=False)
    face.save()
    return Response({'success': True, 'id': face.id, 'name': face.name})


@api_view(['POST'])
def verify_face(request):
    descriptor = request.data.get('descriptor')
    faces = RegisteredFace.objects.all()
    if not faces:
        return Response({'match': False, 'reason': 'No faces registered'})

    def dist(a, b):
        return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))

    best, best_dist = None, float('inf')
    for face in faces:
        d = dist(descriptor, face.descriptor)
        if d < best_dist:
            best_dist = d
            best = face

    if best_dist < 0.45:
        best.access_count += 1
        best.last_login = timezone.now()
        best.save()
        return Response({
            'match':      True,
            'name':       best.name,
            'id':         best.id,
            'photo':      request.build_absolute_uri(best.photo.url) if best.photo else None,
            'confidence': round((1 - best_dist/0.8) * 100)
        })
    return Response({'match': False})


@api_view(['GET'])
def list_faces(request):
    faces = RegisteredFace.objects.all()
    return Response([{
        'id':           f.id,
        'name':         f.name,
        'photo':        request.build_absolute_uri(f.photo.url) if f.photo else None,
        'access_count': f.access_count,
        'last_login':   f.last_login,
    } for f in faces])


@api_view(['DELETE'])
def delete_face(request, face_id):
    try:
        RegisteredFace.objects.get(id=face_id).delete()
        return Response({'success': True})
    except:
        return Response({'success': False})


@api_view(['POST'])
def clear_login_history(request, face_id):
    try:
        face = RegisteredFace.objects.get(id=face_id)
        face.access_count = 0
        face.last_login = None
        face.save()
        return Response({'success': True, 'message': f'Login history cleared for {face.name}'})
    except RegisteredFace.DoesNotExist:
        return Response({'success': False, 'message': 'User not found'}, status=404)
    except Exception as e:
        return Response({'success': False, 'message': str(e)}, status=500)


@api_view(['POST'])
def send_command(request):
    try:
        robot_id = request.data.get('robot_id')  # None for broadcast
        command_type = request.data.get('command_type', 'message')
        message = request.data.get('message', '')
        
        if not message:
            return Response({'success': False, 'message': 'Message cannot be empty'}, status=400)
        
        cmd = RobotCommand(
            robot_id=robot_id,
            command_type=command_type,
            message=message
        )
        cmd.save()
        
        target = robot_id if robot_id else 'ALL ROBOTS'
        return Response({
            'success': True,
            'id': cmd.id,
            'message': f'Command sent to {target}',
            'target': target
        })
    except Exception as e:
        return Response({'success': False, 'message': str(e)}, status=500)


@api_view(['GET'])
def get_commands(request):
    try:
        robot_id = request.query_params.get('robot_id')
        limit = min(int(request.query_params.get('limit', 50)), 100)
        
        if robot_id:
            cmds = RobotCommand.objects.filter(robot_id=robot_id).order_by('-created_at')[:limit]
        else:
            cmds = RobotCommand.objects.all().order_by('-created_at')[:limit]
        
        return Response([{
            'id': c.id,
            'robot_id': c.robot_id,
            'command_type': c.command_type,
            'message': c.message,
            'created_at': c.created_at,
            'executed': c.executed,
            'executed_at': c.executed_at,
        } for c in cmds])
    except Exception as e:
        return Response({'success': False, 'message': str(e)}, status=500)


@api_view(['POST'])
def execute_command(request, command_id):
    try:
        cmd = RobotCommand.objects.get(id=command_id)
        cmd.executed = True
        cmd.executed_at = timezone.now()
        cmd.save()
        return Response({'success': True, 'message': 'Command executed'})
    except RobotCommand.DoesNotExist:
        return Response({'success': False, 'message': 'Command not found'}, status=404)
    except Exception as e:
        return Response({'success': False, 'message': str(e)}, status=500)