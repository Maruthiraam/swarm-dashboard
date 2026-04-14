from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register_face),
    path('verify/',   views.verify_face),
    path('list/',     views.list_faces),
    path('delete/<int:face_id>/', views.delete_face),
    path('clear-history/<int:face_id>/', views.clear_login_history),
    path('send-command/', views.send_command),
    path('commands/', views.get_commands),
    path('execute-command/<int:command_id>/', views.execute_command),
]